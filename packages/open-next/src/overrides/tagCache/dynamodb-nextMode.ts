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
function buildDynamoObject(tag: string, revalidatedAt?: number) {
  return {
    path: { S: buildDynamoKey(tag) },
    tag: { S: buildDynamoKey(tag) },
    revalidatedAt: { N: `${revalidatedAt ?? Date.now()}` },
  };
}

// This implementation does not support automatic invalidation of paths by the cdn
export default {
  name: "ddb-nextMode",
  mode: "nextMode",
  hasBeenRevalidated: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    if (tags.length > 100) {
      throw new RecoverableError(
        "Cannot query more than 100 tags at once. You should not be using this tagCache implementation for this amount of tags",
      );
    }
    const { CACHE_DYNAMO_TABLE } = process.env;
    // It's unlikely that we will have more than 100 items to query
    // If that's the case, you should not use this tagCache implementation
    const response = await awsFetch(
      JSON.stringify({
        RequestItems: {
          [CACHE_DYNAMO_TABLE ?? ""]: {
            Keys: tags.map((tag) => ({
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
    // Now we need to check for every item if lastModified is greater than the revalidatedAt
    const { Responses } = await response.json();
    if (!Responses) {
      return false;
    }
    const revalidatedTags = Responses[CACHE_DYNAMO_TABLE ?? ""].filter(
      (item: any) =>
        Number.parseInt(item.revalidatedAt.N) > (lastModified ?? 0),
    );
    debug("retrieved tags", revalidatedTags);
    return revalidatedTags.length > 0;
  },
  writeTags: async (tags: string[]) => {
    try {
      const { CACHE_DYNAMO_TABLE } = process.env;
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return;
      }
      const dataChunks = chunk(tags, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT).map(
        (Items) => ({
          RequestItems: {
            [CACHE_DYNAMO_TABLE ?? ""]: Items.map((tag) => ({
              PutRequest: {
                Item: {
                  ...buildDynamoObject(tag),
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
