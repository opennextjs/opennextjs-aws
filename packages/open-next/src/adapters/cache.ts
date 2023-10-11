import path from "path";
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
  PutObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import { debug, error } from "./logger.js";

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

type Extension =
  | "json"
  | "html"
  | "rsc"
  | "body"
  | "meta"
  | "fetch"
  | "redirect";

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

  public async get(key: string, options?: boolean | { fetchCache?: boolean }) {
    if (globalThis.disableIncrementalCache) {
      return null;
    }
    const isFetchCache =
      typeof options === "object" ? options.fetchCache : options;
    const keys = await this.listS3Object(key);
    if (keys.length === 0) return null;
    debug("keys", keys);
    return isFetchCache
      ? this.getFetchCache(key, keys)
      : this.getIncrementalCache(key, keys);
  }

  async getFetchCache(key: string, keys: string[]) {
    debug("get fetch cache", { key });
    try {
      const { Body, LastModified } = await this.getS3Object(key, "fetch", keys);
      const lastModified = await this.getHasRevalidatedTags(
        key,
        LastModified?.getTime()
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

  async getIncrementalCache(
    key: string,
    keys: string[]
  ): Promise<CacheHandlerValue | null> {
    if (keys.includes(this.buildS3Key(key, "body"))) {
      debug("get body cache ", { key });
      try {
        const [{ Body, LastModified }, { Body: MetaBody }] = await Promise.all([
          this.getS3Object(key, "body", keys),
          this.getS3Object(key, "meta", keys),
        ]);
        const body = await Body?.transformToByteArray();
        const meta = JSON.parse((await MetaBody?.transformToString()) ?? "{}");

        return {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "ROUTE",
            body: Buffer.from(body ?? Buffer.alloc(0)),
            status: meta.status,
            headers: meta.headers,
          },
        } as CacheHandlerValue;
      } catch (e) {
        error("Failed to get body cache", e);
      }
      return null;
    }

    if (keys.includes(this.buildS3Key(key, "html"))) {
      const isJson = keys.includes(this.buildS3Key(key, "json"));
      const isRsc = keys.includes(this.buildS3Key(key, "rsc"));
      debug("get html cache ", { key, isJson, isRsc });
      if (!isJson && !isRsc) return null;

      try {
        const [{ Body, LastModified }, { Body: PageBody }, { Body: MetaBody }] =
          await Promise.all([
            this.getS3Object(key, "html", keys),
            this.getS3Object(key, isJson ? "json" : "rsc", keys),
            this.getS3Object(key, "meta", keys),
          ]);
        const lastModified = await this.getHasRevalidatedTags(
          key,
          LastModified?.getTime()
        );
        if (lastModified === -1) {
          // If some tags are stale we need to force revalidation
          return null;
        }
        const meta = JSON.parse((await MetaBody?.transformToString()) ?? "{}");
        return {
          lastModified,
          value: {
            kind: "PAGE",
            html: (await Body?.transformToString()) ?? "",
            pageData: isJson
              ? JSON.parse((await PageBody?.transformToString()) ?? "{}")
              : await PageBody?.transformToString(),
            status: meta.status,
            headers: meta.headers,
          },
        } as CacheHandlerValue;
      } catch (e) {
        error("Failed to get html cache", e);
      }
      return null;
    }

    // Check for redirect last. This way if a page has been regenerated
    // after having been redirected, we'll get the page data
    if (keys.includes(this.buildS3Key(key, "redirect"))) {
      debug("get redirect cache", { key });
      try {
        const { Body, LastModified } = await this.getS3Object(
          key,
          "redirect",
          keys
        );
        return {
          lastModified: LastModified?.getTime(),
          value: JSON.parse((await Body?.transformToString()) ?? "{}"),
        };
      } catch (e) {
        error("Failed to get redirect cache", e);
      }
      return null;
    }

    return null;
  }

  async set(key: string, data?: IncrementalCacheValue): Promise<void> {
    if (globalThis.disableIncrementalCache) {
      return;
    }
    if (data?.kind === "ROUTE") {
      const { body, status, headers } = data;
      await Promise.all([
        this.putS3Object(key, "body", body),
        this.putS3Object(key, "meta", JSON.stringify({ status, headers })),
      ]);
    } else if (data?.kind === "PAGE") {
      const { html, pageData } = data;
      const isAppPath = typeof pageData === "string";
      let metaPromise: Promise<PutObjectCommandOutput | void> =
        Promise.resolve();
      if (data.status || data.headers) {
        metaPromise = this.putS3Object(
          key,
          "meta",
          JSON.stringify({ status: data.status, headers: data.headers })
        );
      }
      await Promise.all([
        this.putS3Object(key, "html", html),
        this.putS3Object(
          key,
          isAppPath ? "rsc" : "json",
          isAppPath ? pageData : JSON.stringify(pageData)
        ),
        metaPromise,
      ]);
    } else if (data?.kind === "FETCH") {
      await this.putS3Object(key, "fetch", JSON.stringify(data));
    } else if (data?.kind === "REDIRECT") {
      // delete potential page data if we're redirecting
      await this.deleteS3Objects(key);
      await this.putS3Object(key, "redirect", JSON.stringify(data));
    } else if (data === null || data === undefined) {
      await this.deleteS3Objects(key);
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
        }))
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
      })) ?? []
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
        })
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
        })
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
        })
      );
      return (
        // We need to remove the buildId from the path
        Items?.map(
          ({ path: { S: key } }) => key?.replace(`${this.buildId}/`, "") ?? ""
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
        this.chunkArray(req, 25).map((Items) => {
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
            })
          );
        })
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

  private chunkArray<T>(array: T[], chunkSize: number) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // S3 handling

  private buildS3Key(key: string, extension: Extension) {
    return path.posix.join(
      CACHE_BUCKET_KEY_PREFIX ?? "",
      extension === "fetch" ? "__fetch" : "",
      this.buildId,
      extension === "fetch" ? key : `${key}.${extension}`
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
      })
    );
    return (Contents ?? []).map(({ Key }) => Key) as string[];
  }

  private async getS3Object(key: string, extension: Extension, keys: string[]) {
    try {
      if (!keys.includes(this.buildS3Key(key, extension)))
        return { Body: null, LastModified: null };
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: CACHE_BUCKET_NAME,
          Key: this.buildS3Key(key, extension),
        })
      );
      return result;
    } catch (e) {
      error("This error can usually be ignored : ", e);
      return { Body: null, LastModified: null };
    }
  }

  private putS3Object(
    key: string,
    extension: Extension,
    value: PutObjectCommandInput["Body"]
  ) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
        Body: value,
      })
    );
  }

  private async deleteS3Objects(key: string) {
    try {
      const regex = new RegExp(`\.(json|rsc|html|body|meta|fetch|redirect)$`);
      const s3Keys = (await this.listS3Object(key)).filter(
        (key) => key && regex.test(key)
      );

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: CACHE_BUCKET_NAME,
          Delete: {
            Objects: s3Keys.map((Key) => ({ Key })),
          },
        })
      );
    } catch (e) {
      error("Failed to delete cache", e);
    }
  }
}
