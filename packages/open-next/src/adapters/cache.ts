import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import path from "path";

import { IncrementalCache } from "../cache/incremental/types.js";
import { MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT } from "./constants.js";
import { debug, error } from "./logger.js";
import { chunk } from "./util.js";

interface CachedFetchValue {
  kind: "FETCH";
  data: {
    headers: { [k: string]: string };
    body: string;
    url: string;
    status?: number;
    tags?: string[];
  };
  revalidate: number;
}

interface CachedRedirectValue {
  kind: "REDIRECT";
  props: Object;
}

interface CachedRouteValue {
  kind: "ROUTE";
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  body: Buffer;
  status: number;
  headers: Record<string, undefined | string | string[]>;
}

interface CachedImageValue {
  kind: "IMAGE";
  etag: string;
  buffer: Buffer;
  extension: string;
  isMiss?: boolean;
  isStale?: boolean;
}

interface IncrementalCachedPageValue {
  kind: "PAGE";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  pageData: Object;
  status?: number;
  headers?: Record<string, undefined | string>;
}

type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | CachedImageValue
  | CachedFetchValue
  | CachedRouteValue;

interface CacheHandlerContext {
  fs?: never;
  dev?: boolean;
  flushToDisk?: boolean;
  serverDistDir?: string;
  maxMemoryCacheSize?: number;
  _appDir: boolean;
  _requestHeaders: never;
  fetchCacheKeyPrefix?: string;
}

interface CacheHandlerValue {
  lastModified?: number;
  age?: number;
  cacheState?: string;
  value: IncrementalCacheValue | null;
}

/** Beginning single backslash is intentional, to look for the dot + the extension. Do not escape it again. */
const CACHE_EXTENSION_REGEX = /\.(cache|fetch)$/;

export function hasCacheExtension(key: string) {
  return CACHE_EXTENSION_REGEX.test(key);
}

// Expected environment variables
const { CACHE_DYNAMO_TABLE, NEXT_BUILD_ID } = process.env;

declare global {
  var incrementalCache: IncrementalCache;
  var dynamoClient: DynamoDBClient;
  var disableDynamoDBCache: boolean;
  var disableIncrementalCache: boolean;
  var lastModified: number;
}

export default class S3Cache {
  private client: IncrementalCache;
  private dynamoClient: DynamoDBClient;
  private buildId: string;

  constructor(_ctx: CacheHandlerContext) {
    this.client = globalThis.incrementalCache;
    this.dynamoClient = globalThis.dynamoClient;
    this.buildId = NEXT_BUILD_ID!;
  }

  public async get(key: string, options?: boolean | { fetchCache?: boolean }) {
    if (globalThis.disableIncrementalCache) {
      return null;
    }
    const isFetchCache =
      typeof options === "object" ? options.fetchCache : options;
    return isFetchCache
      ? this.getFetchCache(key)
      : this.getIncrementalCache(key);
  }

  async getFetchCache(key: string) {
    debug("get fetch cache", { key });
    try {
      const { value, lastModified } = await this.client.get(key, true);
      // const { Body, LastModified } = await this.getS3Object(key, "fetch");
      const _lastModified = await this.getHasRevalidatedTags(key, lastModified);
      if (_lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }

      if (value === undefined) return null;

      return {
        lastModified: _lastModified,
        value: value,
      } as CacheHandlerValue;
    } catch (e) {
      error("Failed to get fetch cache", e);
      return null;
    }
  }

  async getIncrementalCache(key: string): Promise<CacheHandlerValue | null> {
    try {
      const { value: cacheData, lastModified } = await this.client.get(
        key,
        false,
      );
      // const { Body, LastModified } = await this.getS3Object(key, "cache");
      // const cacheData = JSON.parse(
      //   (await Body?.transformToString()) ?? "{}",
      // ) as S3CachedFile;
      const meta = cacheData?.meta;
      const _lastModified = await this.getHasRevalidatedTags(key, lastModified);
      if (_lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }
      globalThis.lastModified = _lastModified;
      if (cacheData?.type === "route") {
        return {
          lastModified: _lastModified,
          value: {
            kind: "ROUTE",
            body: Buffer.from(cacheData.body ?? Buffer.alloc(0)),
            status: meta?.status,
            headers: meta?.headers,
          },
        } as CacheHandlerValue;
      } else if (cacheData?.type === "page" || cacheData?.type === "app") {
        return {
          lastModified: _lastModified,
          value: {
            kind: "PAGE",
            html: cacheData.html,
            pageData:
              cacheData.type === "page" ? cacheData.json : cacheData.rsc,
            status: meta?.status,
            headers: meta?.headers,
          },
        } as CacheHandlerValue;
      } else if (cacheData?.type === "redirect") {
        return {
          lastModified: _lastModified,
          value: {
            kind: "REDIRECT",
            props: cacheData.props,
          },
        } as CacheHandlerValue;
      } else {
        warn("Unknown cache type", cacheData);
        return null;
      }
    } catch (e) {
      error("Failed to get body cache", e);
      return null;
    }
  }

  async set(key: string, data?: IncrementalCacheValue): Promise<void> {
    if (globalThis.disableIncrementalCache) {
      return;
    }
    if (data?.kind === "ROUTE") {
      const { body, status, headers } = data;
      await this.client.set(
        key,
        {
          type: "route",
          body: body.toString("utf8"),
          meta: {
            status,
            headers,
          },
        },
        false,
      );
    } else if (data?.kind === "PAGE") {
      const { html, pageData } = data;
      const isAppPath = typeof pageData === "string";
      if (isAppPath) {
        this.client.set(
          key,
          {
            type: "app",
            html,
            rsc: pageData,
          },
          false,
        );
      } else {
        this.client.set(
          key,
          {
            type: "page",
            html,
            json: pageData,
          },
          false,
        );
      }
    } else if (data?.kind === "FETCH") {
      await this.client.set<true>(key, data, true);
    } else if (data?.kind === "REDIRECT") {
      await this.client.set(
        key,
        {
          type: "redirect",
          props: data.props,
        },
        false,
      );
    } else if (data === null || data === undefined) {
      await this.client.delete(key);
    }
    // Write derivedTags to dynamodb
    // If we use an in house version of getDerivedTags in build we should use it here instead of next's one
    const derivedTags: string[] =
      data?.kind === "FETCH"
        ? data.data.tags ?? []
        : data?.kind === "PAGE"
        ? data.headers?.["x-next-cache-tags"]?.split(",") ?? []
        : [];
    debug("derivedTags", derivedTags);
    // Get all tags stored in dynamodb for the given key
    // If any of the derived tags are not stored in dynamodb for the given key, write them
    const storedTags = await this.getTagsByPath(key);
    const tagsToWrite = derivedTags.filter((tag) => !storedTags.includes(tag));
    if (tagsToWrite.length > 0) {
      await this.batchWriteDynamoItem(
        tagsToWrite.map((tag) => ({
          path: key,
          tag: tag,
        })),
      );
    }
  }

  public async revalidateTag(tag: string) {
    if (globalThis.disableDynamoDBCache || globalThis.disableIncrementalCache) {
      return;
    }
    debug("revalidateTag", tag);
    // Find all keys with the given tag
    const paths = await this.getByTag(tag);
    debug("Items", paths);
    // Update all keys with the given tag with revalidatedAt set to now
    await this.batchWriteDynamoItem(
      paths?.map((path) => ({
        path: path,
        tag: tag,
      })) ?? [],
    );
  }

  // DynamoDB handling

  private async getTagsByPath(path: string) {
    try {
      if (disableDynamoDBCache) return [];
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: CACHE_DYNAMO_TABLE,
          IndexName: "revalidate",
          KeyConditionExpression: "#key = :key",
          ExpressionAttributeNames: {
            "#key": "path",
          },
          ExpressionAttributeValues: {
            ":key": { S: this.buildDynamoKey(path) },
          },
        }),
      );
      const tags = result.Items?.map((item) => item.tag.S ?? "") ?? [];
      debug("tags for path", path, tags);
      return tags;
    } catch (e) {
      error("Failed to get tags by path", e);
      return [];
    }
  }

  //TODO: Figure out a better name for this function since it returns the lastModified
  private async getHasRevalidatedTags(key: string, lastModified?: number) {
    try {
      if (disableDynamoDBCache) return lastModified ?? Date.now();
      const result = await this.dynamoClient.send(
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
            ":key": { S: this.buildDynamoKey(key) },
            ":lastModified": { N: String(lastModified ?? 0) },
          },
        }),
      );
      const revalidatedTags = result.Items ?? [];
      debug("revalidatedTags", revalidatedTags);
      // If we have revalidated tags we return -1 to force revalidation
      return revalidatedTags.length > 0 ? -1 : lastModified ?? Date.now();
    } catch (e) {
      error("Failed to get revalidated tags", e);
      return lastModified ?? Date.now();
    }
  }

  private async getByTag(tag: string) {
    try {
      if (disableDynamoDBCache) return [];
      const { Items } = await this.dynamoClient.send(
        new QueryCommand({
          TableName: CACHE_DYNAMO_TABLE,
          KeyConditionExpression: "#tag = :tag",
          ExpressionAttributeNames: {
            "#tag": "tag",
          },
          ExpressionAttributeValues: {
            ":tag": { S: this.buildDynamoKey(tag) },
          },
        }),
      );
      return (
        // We need to remove the buildId from the path
        Items?.map(
          ({ path: { S: key } }) => key?.replace(`${this.buildId}/`, "") ?? "",
        ) ?? []
      );
    } catch (e) {
      error("Failed to get by tag", e);
      return [];
    }
  }

  private async batchWriteDynamoItem(req: { path: string; tag: string }[]) {
    try {
      if (disableDynamoDBCache) return;
      await Promise.all(
        chunk(req, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT).map((Items) => {
          return this.dynamoClient.send(
            new BatchWriteItemCommand({
              RequestItems: {
                [CACHE_DYNAMO_TABLE ?? ""]: Items.map((Item) => ({
                  PutRequest: {
                    Item: {
                      ...this.buildDynamoObject(Item.path, Item.tag),
                    },
                  },
                })),
              },
            }),
          );
        }),
      );
    } catch (e) {
      error("Failed to batch write dynamo item", e);
    }
  }

  private buildDynamoKey(key: string) {
    // FIXME: We should probably use something else than path.join here
    // this could transform some fetch cache key into a valid path
    return path.posix.join(this.buildId, key);
  }

  private buildDynamoObject(path: string, tags: string) {
    return {
      path: { S: this.buildDynamoKey(path) },
      tag: { S: this.buildDynamoKey(tags) },
      revalidatedAt: { N: `${Date.now()}` },
    };
  }
}
