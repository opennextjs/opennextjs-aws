import type { CacheValue, IncrementalCache } from "types/overrides";
import S3Cache, { getAwsClient } from "./s3-lite";
import { customFetchClient } from "utils/fetch";
import { debug } from "../../adapters/logger";

// TTL for the local cache in milliseconds
const localCacheTTL = process.env.OPEN_NEXT_LOCAL_CACHE_TTL
  ? Number.parseInt(process.env.OPEN_NEXT_LOCAL_CACHE_TTL)
  : 0;
// Maximum size of the local cache in nb of entries
const maxCacheSize = process.env.OPEN_NEXT_LOCAL_CACHE_SIZE
  ? Number.parseInt(process.env.OPEN_NEXT_LOCAL_CACHE_SIZE)
  : 1000;

class LRUCache {
  private cache: Map<
    string,
    {
      value: CacheValue<boolean>;
      lastModified: number;
    }
  > = new Map();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  // isFetch is not used here, only used for typing
  get<T extends boolean = false>(key: string, isFetch?: T) {
    return this.cache.get(key) as {
      value: CacheValue<T>;
      lastModified: number;
    };
  }

  set(key: string, value: any) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string) {
    this.cache.delete(key);
  }
}

const localCache = new LRUCache(maxCacheSize);

const awsFetch = (body: RequestInit["body"], type: "get" | "set" = "get") => {
  const { CACHE_BUCKET_REGION } = process.env;
  const client = getAwsClient();
  return customFetchClient(client)(
    `https://dynamodb.${CACHE_BUCKET_REGION}.amazonaws.com`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": `DynamoDB_20120810.${
          type === "get" ? "GetItem" : "PutItem"
        }`,
      },
      body,
    },
  );
};

const buildDynamoKey = (key: string) => {
  const { NEXT_BUILD_ID } = process.env;
  return `__meta_${NEXT_BUILD_ID}_${key}`;
};

/**
 * This cache implementation uses a multi-tier cache with a local cache, a DynamoDB metadata cache and an S3 cache.
 * It uses the same DynamoDB table as the default tag cache and the same S3 bucket as the default incremental cache.
 * It will first check the local cache.
 * If the local cache is expired, it will check the DynamoDB metadata cache to see if the local cache is still valid.
 * Lastly it will check the S3 cache.
 */
const multiTierCache: IncrementalCache = {
  name: "multi-tier-ddb-s3",
  async get(key, isFetch) {
    // First we check the local cache
    const localCacheEntry = localCache.get(key, isFetch);
    if (localCacheEntry) {
      if (Date.now() - localCacheEntry.lastModified < localCacheTTL) {
        debug("Using local cache without checking ddb");
        return localCacheEntry;
      }
      try {
        // Here we'll check ddb metadata to see if the local cache is still valid
        const { CACHE_DYNAMO_TABLE } = process.env;
        const result = await awsFetch(
          JSON.stringify({
            TableName: CACHE_DYNAMO_TABLE,
            Key: {
              path: { S: buildDynamoKey(key) },
              tag: { S: buildDynamoKey(key) },
            },
          }),
        );
        if (result.status === 200) {
          const data = await result.json();
          const hasBeenDeleted = data.Item?.deleted?.BOOL;
          if (hasBeenDeleted) {
            localCache.delete(key);
            return { value: undefined, lastModified: 0 };
          }
          // If the metadata is older than the local cache, we can use the local cache
          // If it's not found we assume that no write has been done yet and we can use the local cache
          const lastModified = data.Item?.revalidatedAt?.N
            ? Number.parseInt(data.Item.revalidatedAt.N)
            : 0;
          if (lastModified <= localCacheEntry.lastModified) {
            debug("Using local cache after checking ddb");
            return localCacheEntry;
          }
        }
      } catch (e) {
        debug("Failed to get metadata from ddb", e);
      }
    }
    const result = await S3Cache.get(key, isFetch);
    if (result.value) {
      localCache.set(key, {
        value: result.value,
        lastModified: result.lastModified ?? Date.now(),
      });
    }
    return result;
  },
  async set(key, value, isFetch) {
    const revalidatedAt = Date.now();
    await S3Cache.set(key, value, isFetch);
    await awsFetch(
      JSON.stringify({
        TableName: process.env.CACHE_DYNAMO_TABLE,
        Item: {
          tag: { S: buildDynamoKey(key) },
          path: { S: buildDynamoKey(key) },
          revalidatedAt: { N: String(revalidatedAt) },
        },
      }),
      "set",
    );
    localCache.set(key, {
      value,
      lastModified: revalidatedAt,
    });
  },
  async delete(key) {
    await S3Cache.delete(key);
    await awsFetch(
      JSON.stringify({
        TableName: process.env.CACHE_DYNAMO_TABLE,
        Item: {
          tag: { S: buildDynamoKey(key) },
          path: { S: buildDynamoKey(key) },
          deleted: { BOOL: true },
        },
      }),
      "set",
    );
    localCache.delete(key);
  },
};

export default multiTierCache;
