import type { NextModeTagCache } from "types/overrides";

import { AwsClient } from "aws4fetch";
import { RecoverableError } from "utils/error";
import { customFetchClient } from "utils/fetch";

import path from "node:path";
import { debug, error } from "../../adapters/logger";
import { chunk, parseNumberFromEnv } from "../../adapters/util";
import {
  MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT,
  getDynamoBatchWriteCommandConcurrency,
} from "./constants";

let awsClient: AwsClient | null = null;

const getAwsClient = () => {
  const { CACHE_BUCKET_REGION } = process.env;
  if (awsClient) {
    return awsClient;
  }
  awsClient = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: CACHE_BUCKET_REGION,
    retries: parseNumberFromEnv(process.env.AWS_SDK_S3_MAX_ATTEMPTS),
  });
  return awsClient;
};
const awsFetch = (
  body: RequestInit["body"],
  type: "query" | "batchWrite" = "query",
) => {
  const { CACHE_BUCKET_REGION } = process.env;
  const client = getAwsClient();
  return customFetchClient(client)(
    `https://dynamodb.${CACHE_BUCKET_REGION}.amazonaws.com`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": `DynamoDB_20120810.${
          type === "query" ? "BatchGetItem" : "BatchWriteItem"
        }`,
      },
      body,
    },
  );
};

function buildDynamoKey(key: string) {
  const { NEXT_BUILD_ID } = process.env;
  // FIXME: We should probably use something else than path.join here
  // this could transform some fetch cache key into a valid path
  return path.posix.join(NEXT_BUILD_ID ?? "", "_tag", key);
}

// We use the same key for both path and tag
// That's mostly for compatibility reason so that it's easier to use this with existing infra
// FIXME: Allow a simpler object without an unnecessary path key
function buildDynamoObject(
  tag: string,
  revalidatedAt?: number,
  stale?: number,
  expire?: number,
) {
  const obj: Record<string, any> = {
    path: { S: buildDynamoKey(tag) },
    tag: { S: buildDynamoKey(tag) },
    revalidatedAt: { N: `${revalidatedAt ?? Date.now()}` },
    ...(stale !== undefined ? { stale: { N: `${stale}` } } : {}),
    ...(expire !== undefined ? { expire: { N: `${expire}` } } : {}),
  };
  return obj;
}

// This implementation does not support automatic invalidation of paths by the cdn

/**
 * Checks the items cache for each tag. Returns tags not yet cached and whether
 * a positive result was already found among the cached ones.
 */
function checkItemsCache(
  tags: string[],
  itemsCache: Map<string, any> | undefined,
  compute: (item: any) => boolean,
): { uncachedTags: string[]; hasMatch: boolean } {
  const uncachedTags: string[] = [];
  let hasMatch = false;
  for (const tag of tags) {
    if (itemsCache?.has(tag)) {
      if (compute(itemsCache.get(tag))) hasMatch = true;
    } else {
      uncachedTags.push(tag);
    }
  }
  return { uncachedTags, hasMatch };
}

/**
 * Fetches uncached tags from DynamoDB via BatchGetItem, populates the items
 * cache (storing null for absent tags), and returns whether any tag matched.
 */
async function fetchAndCacheItems(
  uncachedTags: string[],
  itemsCache: Map<string, any> | undefined,
  compute: (item: any) => boolean,
): Promise<boolean> {
  const { CACHE_DYNAMO_TABLE } = process.env;
  const response = await awsFetch(
    JSON.stringify({
      RequestItems: {
        [CACHE_DYNAMO_TABLE ?? ""]: {
          Keys: uncachedTags.map((tag) => ({
            path: { S: buildDynamoKey(tag) },
            tag: { S: buildDynamoKey(tag) },
          })),
        },
      },
    }),
    "query",
  );
  if (response.status !== 200) {
    throw new RecoverableError(
      `Failed to query dynamo item: ${response.status}`,
    );
  }
  const { Responses } = await response.json();
  const responseItems: any[] = Responses?.[CACHE_DYNAMO_TABLE ?? ""] ?? [];

  // Build a lookup map: DynamoDB key → item
  const responseByKey = new Map<string, any>();
  for (const item of responseItems) {
    responseByKey.set(item.tag.S, item);
  }

  let hasMatch = false;
  for (const tag of uncachedTags) {
    const item = responseByKey.get(buildDynamoKey(tag)) ?? null;
    itemsCache?.set(tag, item);
    if (compute(item)) hasMatch = true;
  }
  return hasMatch;
}

export default {
  name: "ddb-nextMode",
  mode: "nextMode",
  getLastRevalidated: async (tags: string[]) => {
    // Not supported for now
    return 0;
  },
  hasBeenRevalidated: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    if (tags.length > 100) {
      throw new RecoverableError(
        "Cannot query more than 100 tags at once. You should not be using this tagCache implementation for this amount of tags",
      );
    }

    const store = globalThis.__openNextAls.getStore();
    const itemsCache = store?.requestCache.getOrCreate<string, any>(
      "ddb-nextMode:tagItems",
    );

    const now = Date.now();
    const compute = (item: any): boolean => {
      if (!item) return false;
      if (item.expire?.N) {
        const expiry = Number.parseInt(item.expire.N);
        if (expiry <= now && expiry > (lastModified ?? 0)) return true;
      }
      return Number.parseInt(item.revalidatedAt.N) > (lastModified ?? 0);
    };

    const { uncachedTags, hasMatch } = checkItemsCache(
      tags,
      itemsCache,
      compute,
    );
    if (hasMatch) return true;
    if (uncachedTags.length === 0) return false;

    // It's unlikely that we will have more than 100 items to query
    // If that's the case, you should not use this tagCache implementation
    const result = await fetchAndCacheItems(uncachedTags, itemsCache, compute);
    debug("retrieved tags for hasBeenRevalidated", tags);
    return result;
  },
  isStale: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    if (tags.length === 0) return false;
    if (tags.length > 100) {
      throw new RecoverableError(
        "Cannot query more than 100 tags at once. You should not be using this tagCache implementation for this amount of tags",
      );
    }

    const store = globalThis.__openNextAls.getStore();
    const itemsCache = store?.requestCache.getOrCreate<string, any>(
      "ddb-nextMode:tagItems",
    );

    const compute = (item: any): boolean => {
      if (!item?.stale?.N) return false;
      return Number.parseInt(item.stale.N) > (lastModified ?? 0);
    };

    const { uncachedTags, hasMatch } = checkItemsCache(
      tags,
      itemsCache,
      compute,
    );
    if (hasMatch) return true;
    if (uncachedTags.length === 0) return false;

    const result = await fetchAndCacheItems(uncachedTags, itemsCache, compute);
    debug("isStale result:", result);
    return result;
  },
  writeTags: async (tags) => {
    try {
      const { CACHE_DYNAMO_TABLE } = process.env;
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return;
      }
      const dataChunks = chunk(tags, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT).map(
        (Items) => ({
          RequestItems: {
            [CACHE_DYNAMO_TABLE ?? ""]: Items.map((tag) => {
              const tagStr = typeof tag === "string" ? tag : tag.tag;
              const stale = typeof tag === "string" ? undefined : tag.stale;
              const expiry = typeof tag === "string" ? undefined : tag.expire;
              return {
                PutRequest: {
                  Item: {
                    ...buildDynamoObject(tagStr, undefined, stale, expiry),
                  },
                },
              };
            }),
          },
        }),
      );
      const toInsert = chunk(
        dataChunks,
        getDynamoBatchWriteCommandConcurrency(),
      );
      for (const paramsChunk of toInsert) {
        await Promise.all(
          paramsChunk.map(async (params) => {
            const response = await awsFetch(
              JSON.stringify(params),
              "batchWrite",
            );
            if (response.status !== 200) {
              throw new RecoverableError(
                `Failed to batch write dynamo item: ${response.status}`,
              );
            }
            return response;
          }),
        );
      }
    } catch (e) {
      error("Failed to batch write dynamo item", e);
    }
  },
} satisfies NextModeTagCache;
