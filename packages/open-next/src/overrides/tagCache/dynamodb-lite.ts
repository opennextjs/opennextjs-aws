/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "node:path";

import { AwsClient } from "aws4fetch";
import type { TagCache } from "types/overrides";
import { RecoverableError } from "utils/error";
import { customFetchClient } from "utils/fetch";

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
          type === "query" ? "Query" : "BatchWriteItem"
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
  return path.posix.join(NEXT_BUILD_ID ?? "", key);
}

function buildDynamoObject(path: string, tags: string, revalidatedAt?: number) {
  return {
    path: { S: buildDynamoKey(path) },
    tag: { S: buildDynamoKey(tags) },
    revalidatedAt: { N: `${revalidatedAt ?? Date.now()}` },
  };
}

const tagCache: TagCache = {
  async getByPath(path) {
    try {
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return [];
      }
      const { CACHE_DYNAMO_TABLE, NEXT_BUILD_ID } = process.env;
      const result = await awsFetch(
        JSON.stringify({
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
      if (result.status !== 200) {
        throw new RecoverableError(
          `Failed to get tags by path: ${result.status}`,
        );
      }
      const { Items } = (await result.json()) as any;

      const tags = Items?.map((item: any) => item.tag.S ?? "") ?? [];
      debug("tags for path", path, tags);
      // We need to remove the buildId from the path
      return tags.map((tag: string) => tag.replace(`${NEXT_BUILD_ID}/`, ""));
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
      const { CACHE_DYNAMO_TABLE, NEXT_BUILD_ID } = process.env;
      const result = await awsFetch(
        JSON.stringify({
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
      if (result.status !== 200) {
        throw new RecoverableError(`Failed to get by tag: ${result.status}`);
      }
      const { Items } = (await result.json()) as any;
      return (
        // We need to remove the buildId from the path
        Items?.map(
          ({ path: { S: key } }: any) =>
            key?.replace(`${NEXT_BUILD_ID}/`, "") ?? "",
        ) ?? []
      );
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
      const { CACHE_DYNAMO_TABLE } = process.env;
      const result = await awsFetch(
        JSON.stringify({
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
      if (result.status !== 200) {
        throw new RecoverableError(
          `Failed to get last modified: ${result.status}`,
        );
      }
      const revalidatedTags = ((await result.json()) as any).Items ?? [];
      debug("revalidatedTags", revalidatedTags);
      // If we have revalidated tags we return -1 to force revalidation
      return revalidatedTags.length > 0 ? -1 : (lastModified ?? Date.now());
    } catch (e) {
      error("Failed to get revalidated tags", e);
      return lastModified ?? Date.now();
    }
  },
  async writeTags(tags) {
    try {
      const { CACHE_DYNAMO_TABLE } = process.env;
      if (globalThis.openNextConfig.dangerous?.disableTagCache) {
        return;
      }
      const dataChunks = chunk(tags, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT).map(
        (Items) => ({
          RequestItems: {
            [CACHE_DYNAMO_TABLE ?? ""]: Items.map((Item) => ({
              PutRequest: {
                Item: {
                  ...buildDynamoObject(Item.path, Item.tag, Item.revalidatedAt),
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
  name: "dynamoDb",
};

export default tagCache;
