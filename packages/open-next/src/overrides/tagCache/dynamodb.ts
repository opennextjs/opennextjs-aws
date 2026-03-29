import path from "node:path";

import type { DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import type { TagCache } from "types/overrides";

import { awsLogger, debug, error } from "../../adapters/logger";
import { chunk, parseNumberFromEnv } from "../../adapters/util";
import {
  MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT,
  getDynamoBatchWriteCommandConcurrency,
} from "./constants";

const { CACHE_BUCKET_REGION, CACHE_DYNAMO_TABLE, NEXT_BUILD_ID } = process.env;

function parseDynamoClientConfigFromEnv(): DynamoDBClientConfig {
  return {
    region: CACHE_BUCKET_REGION,
    logger: awsLogger,
    maxAttempts: parseNumberFromEnv(process.env.AWS_SDK_DYNAMODB_MAX_ATTEMPTS),
  };
}

const dynamoClient = new DynamoDBClient(parseDynamoClientConfigFromEnv());

function buildDynamoKey(key: string) {
  // FIXME: We should probably use something else than path.join here
  // this could transform some fetch cache key into a valid path
  return path.posix.join(NEXT_BUILD_ID ?? "", key);
}

function buildDynamoObject(
  path: string,
  tags: string,
  revalidatedAt?: number,
  stale?: number,
  expiry?: number,
) {
  const obj: Record<string, any> = {
    path: { S: buildDynamoKey(path) },
    tag: { S: buildDynamoKey(tags) },
    revalidatedAt: { N: `${revalidatedAt ?? Date.now()}` },
  };
  if (stale !== undefined) {
    obj.stale = { N: `${stale}` };
  }
  if (expiry !== undefined) {
    obj.expiry = { N: `${expiry}` };
  }
  return obj;
}

const tagCache: TagCache = {
  mode: "original",
  async getByPath(path) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return [];
      }
      const store = globalThis.__openNextAls.getStore();
      const cache = store?.requestCache.getOrCreate<string, string[]>("dynamoDb:getByPath");
      if (cache?.has(path)) {
        return cache.get(path)!;
      }
      const result = await dynamoClient.send(
        new QueryCommand({
          TableName: CACHE_DYNAMO_TABLE,
          IndexName: "revalidate",
          KeyConditionExpression: "#key = :key",
          ExpressionAttributeNames: {
            "#key": "path",
          },
          ExpressionAttributeValues: {
            ":key": { S: buildDynamoKey(path) },
          },
        }),
      );
      const tags = result.Items?.map((item) => item.tag.S ?? "") ?? [];
      debug("tags for path", path, tags);
      // We need to remove the buildId from the path
      const resultTags = tags.map((tag) => tag.replace(`${NEXT_BUILD_ID}/`, ""));
      cache?.set(path, resultTags);
      return resultTags;
    } catch (e) {
      error("Failed to get tags by path", e);
      return [];
    }
  },
  async getByTag(tag) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return [];
      }
      const store = globalThis.__openNextAls.getStore();
      const cache = store?.requestCache.getOrCreate<string, string[]>("dynamoDb:getByTag");
      if (cache?.has(tag)) {
        return cache.get(tag)!;
      }
      const { Items } = await dynamoClient.send(
        new QueryCommand({
          TableName: CACHE_DYNAMO_TABLE,
          KeyConditionExpression: "#tag = :tag",
          ExpressionAttributeNames: {
            "#tag": "tag",
          },
          ExpressionAttributeValues: {
            ":tag": { S: buildDynamoKey(tag) },
          },
        }),
      );
      // We need to remove the buildId from the path
      const paths =
        Items?.map(
          ({ path: { S: key } }) => key?.replace(`${NEXT_BUILD_ID}/`, "") ?? "",
        ) ?? [];
      cache?.set(tag, paths);
      return paths;
    } catch (e) {
      error("Failed to get by tag", e);
      return [];
    }
  },
  async getLastModified(key, lastModified) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return lastModified ?? Date.now();
      }
      const store = globalThis.__openNextAls.getStore();
      const itemsCache = store?.requestCache.getOrCreate<string, any[]>("dynamoDb:revalidateQueryItems");
      const cacheKey = `${key}:${lastModified ?? 0}`;
      let revalidatedTags: any[];
      if (itemsCache?.has(cacheKey)) {
        revalidatedTags = itemsCache.get(cacheKey)!;
      } else {
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: CACHE_DYNAMO_TABLE,
            IndexName: "revalidate",
            KeyConditionExpression:
              "#key = :key AND #revalidatedAt > :lastModified",
            ExpressionAttributeNames: {
              "#key": "path",
              "#revalidatedAt": "revalidatedAt",
            },
            ExpressionAttributeValues: {
              ":key": { S: buildDynamoKey(key) },
              ":lastModified": { N: String(lastModified ?? 0) },
            },
          }),
        );
        revalidatedTags = result.Items ?? [];
        itemsCache?.set(cacheKey, revalidatedTags);
      }
      debug("revalidatedTags", revalidatedTags);

      // Check if any tag has expired
      const now = Date.now();
      const hasExpiredTag = revalidatedTags.some((item) => {
        if (item.expiry?.N) {
          const expiry = Number.parseInt(item.expiry.N);
          return expiry <= now && expiry > (lastModified ?? 0);
        }
        return false;
      });
      // Exclude expired tags from the revalidated count — they are handled
      // separately via hasExpiredTag above.
      const nonExpiredRevalidatedTags = revalidatedTags.filter((item) => {
        if (item.expiry?.N) {
          return Number.parseInt(item.expiry.N) > now;
        }
        return true;
      });

      // If we have revalidated tags or expired tags we return -1 to force revalidation
      return nonExpiredRevalidatedTags.length > 0 || hasExpiredTag
        ? -1
        : (lastModified ?? Date.now());
    } catch (e) {
      error("Failed to get revalidated tags", e);
      return lastModified ?? Date.now();
    }
  },
  async hasBeenStale(key: string, lastModified?: number) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return false;
      }
      const store = globalThis.__openNextAls.getStore();
      const itemsCache = store?.requestCache.getOrCreate<string, any[]>("dynamoDb:revalidateQueryItems");
      const cacheKey = `${key}:${lastModified ?? 0}`;
      let items: any[];
      if (itemsCache?.has(cacheKey)) {
        items = itemsCache.get(cacheKey)!;
      } else {
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: CACHE_DYNAMO_TABLE,
            IndexName: "revalidate",
            KeyConditionExpression:
              "#key = :key AND #revalidatedAt > :lastModified",
            ExpressionAttributeNames: {
              "#key": "path",
              "#revalidatedAt": "revalidatedAt",
            },
            ExpressionAttributeValues: {
              ":key": { S: buildDynamoKey(key) },
              ":lastModified": { N: String(lastModified ?? 0) },
            },
          }),
        );
        items = result.Items ?? [];
        itemsCache?.set(cacheKey, items);
      }
      debug("hasBeenStale items", key, items);
      return items.length > 0;
    } catch (e) {
      error("Failed to check stale tags", e);
      return false;
    }
  },
  async writeTags(tags) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return;
      }
      const dataChunks = chunk(tags, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT).map(
        (Items) => ({
          RequestItems: {
            [CACHE_DYNAMO_TABLE ?? ""]: Items.map((Item) => ({
              PutRequest: {
                Item: {
                  ...buildDynamoObject(
                    Item.path,
                    Item.tag,
                    Item.revalidatedAt,
                    Item.stale,
                    Item.expiry,
                  ),
                },
              },
            })),
          },
        }),
      );
      const toInsert = chunk(
        dataChunks,
        getDynamoBatchWriteCommandConcurrency(),
      );
      for (const paramsChunk of toInsert) {
        await Promise.all(
          paramsChunk.map(async (params) =>
            dynamoClient.send(new BatchWriteItemCommand(params)),
          ),
        );
      }
    } catch (e) {
      error("Failed to batch write dynamo item", e);
    }
  },
  name: "dynamoDb",
};

export default tagCache;
