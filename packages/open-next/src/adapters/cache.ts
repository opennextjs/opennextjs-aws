import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import path from "path";

import { MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT } from "./constants.js";
import { debug, error, warn } from "./logger.js";
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

type IncrementalCacheContext = {
  revalidate?: number | false | undefined;
  fetchCache?: boolean | undefined;
  fetchUrl?: string | undefined;
  fetchIdx?: number | undefined;
  tags?: string[] | undefined;
};

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

type Extension = "cache" | "fetch";

interface Meta {
  status?: number;
  headers?: Record<string, undefined | string | string[]>;
}
type S3CachedFile =
  | {
      type: "redirect";
      props?: Object;
      meta?: Meta;
    }
  | {
      type: "page";
      html: string;
      json: Object;
      meta?: Meta;
    }
  | {
      type: "app";
      html: string;
      rsc: string;
      meta?: Meta;
    }
  | {
      type: "route";
      body: string;
      meta?: Meta;
    };

/** Beginning single backslash is intentional, to look for the dot + the extension. Do not escape it again. */
const CACHE_EXTENSION_REGEX = /\.(cache|fetch)$/;

export function hasCacheExtension(key: string) {
  return CACHE_EXTENSION_REGEX.test(key);
}

// Expected environment variables
const {
  CACHE_BUCKET_NAME,
  CACHE_BUCKET_KEY_PREFIX,
  CACHE_DYNAMO_TABLE,
  NEXT_BUILD_ID,
} = process.env;

declare global {
  var S3Client: S3Client;
  var dynamoClient: DynamoDBClient;
  var disableDynamoDBCache: boolean;
  var disableIncrementalCache: boolean;
  var lastModified: number;
}

export default class S3Cache {
  private client: S3Client;
  private dynamoClient: DynamoDBClient;
  private buildId: string;

  constructor(_ctx: CacheHandlerContext) {
    this.client = globalThis.S3Client;
    this.dynamoClient = globalThis.dynamoClient;
    this.buildId = NEXT_BUILD_ID!;
  }

  public async get(
    key: string,
    // fetchCache is for next 13.5 and above, kindHint is for next 14 and above and boolean is for earlier versions
    options?:
      | boolean
      | { fetchCache?: boolean; kindHint?: "app" | "pages" | "fetch" },
  ) {
    if (globalThis.disableIncrementalCache) {
      return null;
    }
    const isFetchCache =
      typeof options === "object"
        ? options.kindHint
          ? options.kindHint === "fetch"
          : options.fetchCache
        : options;
    return isFetchCache
      ? this.getFetchCache(key)
      : this.getIncrementalCache(key);
  }

  async getFetchCache(key: string) {
    debug("get fetch cache", { key });
    try {
      const { Body, LastModified } = await this.getS3Object(key, "fetch");
      const lastModified = await this.getHasRevalidatedTags(
        key,
        LastModified?.getTime(),
      );
      if (lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }

      if (Body === null) return null;

      return {
        lastModified,
        value: JSON.parse((await Body?.transformToString()) ?? "{}"),
      } as CacheHandlerValue;
    } catch (e) {
      error("Failed to get fetch cache", e);
      return null;
    }
  }

  async getIncrementalCache(key: string): Promise<CacheHandlerValue | null> {
    try {
      const { Body, LastModified } = await this.getS3Object(key, "cache");
      const cacheData = JSON.parse(
        (await Body?.transformToString()) ?? "{}",
      ) as S3CachedFile;
      const meta = cacheData.meta;
      const lastModified = await this.getHasRevalidatedTags(
        key,
        LastModified?.getTime(),
      );
      if (lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }
      globalThis.lastModified = lastModified;
      if (cacheData.type === "route") {
        return {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "ROUTE",
            body: Buffer.from(
              cacheData.body ?? Buffer.alloc(0),
              String(meta?.headers?.["content-type"]).startsWith("image")
                ? "base64"
                : "utf8",
            ),
            status: meta?.status,
            headers: meta?.headers,
          },
        } as CacheHandlerValue;
      } else if (cacheData.type === "page" || cacheData.type === "app") {
        return {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "PAGE",
            html: cacheData.html,
            pageData:
              cacheData.type === "page" ? cacheData.json : cacheData.rsc,
            status: meta?.status,
            headers: meta?.headers,
          },
        } as CacheHandlerValue;
      } else if (cacheData.type === "redirect") {
        return {
          lastModified: LastModified?.getTime(),
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

  async set(
    key: string,
    data?: IncrementalCacheValue,
    ctx?: IncrementalCacheContext,
  ): Promise<void> {
    if (globalThis.disableIncrementalCache) {
      return;
    }
    if (data?.kind === "ROUTE") {
      const { body, status, headers } = data;
      this.putS3Object(
        key,
        "cache",
        JSON.stringify({
          type: "route",
          body: body.toString(
            String(headers["content-type"]).startsWith("image")
              ? "base64"
              : "utf8",
          ),
          meta: {
            status,
            headers,
          },
        } as S3CachedFile),
      );
    } else if (data?.kind === "PAGE") {
      const { html, pageData } = data;
      const isAppPath = typeof pageData === "string";
      this.putS3Object(
        key,
        "cache",
        JSON.stringify({
          type: isAppPath ? "app" : "page",
          html,
          rsc: isAppPath ? pageData : undefined,
          json: isAppPath ? undefined : pageData,
          meta: { status: data.status, headers: data.headers },
        } as S3CachedFile),
      );
    } else if (data?.kind === "FETCH") {
      await this.putS3Object(key, "fetch", JSON.stringify(data));
    } else if (data?.kind === "REDIRECT") {
      // // delete potential page data if we're redirecting
      await this.putS3Object(
        key,
        "cache",
        JSON.stringify({
          type: "redirect",
          props: data.props,
        } as S3CachedFile),
      );
    } else if (data === null || data === undefined) {
      await this.deleteS3Objects(key);
    }
    // Write derivedTags to dynamodb
    // If we use an in house version of getDerivedTags in build we should use it here instead of next's one
    const derivedTags: string[] =
      data?.kind === "FETCH"
        ? ctx?.tags ?? data?.data?.tags ?? [] // before version 14 next.js used data?.data?.tags so we keep it for backward compatibility
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

  // S3 handling

  private buildS3Key(key: string, extension: Extension) {
    return path.posix.join(
      CACHE_BUCKET_KEY_PREFIX ?? "",
      extension === "fetch" ? "__fetch" : "",
      this.buildId,
      extension === "fetch" ? key : `${key}.${extension}`,
    );
  }

  private buildS3KeyPrefix(key: string) {
    return path.posix.join(CACHE_BUCKET_KEY_PREFIX ?? "", this.buildId, key);
  }

  private async listS3Object(key: string) {
    const { Contents } = await this.client.send(
      new ListObjectsV2Command({
        Bucket: CACHE_BUCKET_NAME,
        // add a point to the key so that it only matches the key and
        // not other keys starting with the same string
        Prefix: `${this.buildS3KeyPrefix(key)}.`,
      }),
    );
    return (Contents ?? []).map(({ Key }) => Key) as string[];
  }

  private async getS3Object(key: string, extension: Extension) {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: CACHE_BUCKET_NAME,
          Key: this.buildS3Key(key, extension),
        }),
      );
      return result;
    } catch (e) {
      warn("This error can usually be ignored : ", e);
      return { Body: null, LastModified: null };
    }
  }

  private putS3Object(
    key: string,
    extension: Extension,
    value: PutObjectCommandInput["Body"],
  ) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
        Body: value,
      }),
    );
  }

  private async deleteS3Objects(key: string) {
    try {
      const s3Keys = (await this.listS3Object(key)).filter(
        (key) => key && hasCacheExtension(key),
      );

      if (s3Keys.length === 0) {
        warn(
          `No s3 keys with a valid cache extension found for ${key}, see type CacheExtension in OpenNext for details`,
        );
        return;
      }

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: CACHE_BUCKET_NAME,
          Delete: {
            Objects: s3Keys.map((Key) => ({ Key })),
          },
        }),
      );
    } catch (e) {
      error("Failed to delete cache", e);
    }
  }
}
