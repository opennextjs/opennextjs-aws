import { DetachedPromise } from "utils/promise.js";

import { IncrementalCache } from "../cache/incremental/types.js";
import { TagCache } from "../cache/tag/types.js";
import { isBinaryContentType } from "./binary.js";
import { debug, error, warn } from "./logger.js";

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

/** Beginning single backslash is intentional, to look for the dot + the extension. Do not escape it again. */
const CACHE_EXTENSION_REGEX = /\.(cache|fetch)$/;

export function hasCacheExtension(key: string) {
  return CACHE_EXTENSION_REGEX.test(key);
}

declare global {
  var incrementalCache: IncrementalCache;
  var tagCache: TagCache;
  var disableDynamoDBCache: boolean;
  var disableIncrementalCache: boolean;
  var lastModified: Record<string, number>;
}
// We need to use globalThis client here as this class can be defined at load time in next 12 but client is not available at load time
export default class S3Cache {
  constructor(_ctx: CacheHandlerContext) {}

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
      const { value, lastModified } = await globalThis.incrementalCache.get(
        key,
        true,
      );
      // const { Body, LastModified } = await this.getS3Object(key, "fetch");
      const _lastModified = await globalThis.tagCache.getLastModified(
        key,
        lastModified,
      );
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
      // We can usually ignore errors here as they are usually due to cache not being found
      debug("Failed to get fetch cache", e);
      return null;
    }
  }

  async getIncrementalCache(key: string): Promise<CacheHandlerValue | null> {
    try {
      const { value: cacheData, lastModified } =
        await globalThis.incrementalCache.get(key, false);
      // const { Body, LastModified } = await this.getS3Object(key, "cache");
      // const cacheData = JSON.parse(
      //   (await Body?.transformToString()) ?? "{}",
      // ) as S3CachedFile;
      const meta = cacheData?.meta;
      const _lastModified = await globalThis.tagCache.getLastModified(
        key,
        lastModified,
      );
      if (_lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }
      const requestId = globalThis.__als.getStore()?.requestId ?? "";
      globalThis.lastModified[requestId] = _lastModified;
      if (cacheData?.type === "route") {
        return {
          lastModified: _lastModified,
          value: {
            kind: "ROUTE",
            body: Buffer.from(
              cacheData.body ?? Buffer.alloc(0),
              isBinaryContentType(String(meta?.headers?.["content-type"]))
                ? "base64"
                : "utf8",
            ),
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
      // We can usually ignore errors here as they are usually due to cache not being found
      debug("Failed to get body cache", e);
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
    const detachedPromise = new DetachedPromise<void>();
    globalThis.__als.getStore()?.pendingPromises.push(detachedPromise);
    try {
      if (data?.kind === "ROUTE") {
        const { body, status, headers } = data;
        await globalThis.incrementalCache.set(
          key,
          {
            type: "route",
            body: body.toString(
              isBinaryContentType(String(headers["content-type"]))
                ? "base64"
                : "utf8",
            ),
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
          globalThis.incrementalCache.set(
            key,
            {
              type: "app",
              html,
              rsc: pageData,
            },
            false,
          );
        } else {
          globalThis.incrementalCache.set(
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
        await globalThis.incrementalCache.set<true>(key, data, true);
      } else if (data?.kind === "REDIRECT") {
        await globalThis.incrementalCache.set(
          key,
          {
            type: "redirect",
            props: data.props,
          },
          false,
        );
      } else if (data === null || data === undefined) {
        await globalThis.incrementalCache.delete(key);
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
      const storedTags = await globalThis.tagCache.getByPath(key);
      const tagsToWrite = derivedTags.filter(
        (tag) => !storedTags.includes(tag),
      );
      if (tagsToWrite.length > 0) {
        await globalThis.tagCache.writeTags(
          tagsToWrite.map((tag) => ({
            path: key,
            tag: tag,
          })),
        );
      }
      debug("Finished setting cache");
    } catch (e) {
      error("Failed to set cache", e);
    } finally {
      // We need to resolve the promise even if there was an error
      detachedPromise.resolve();
    }
  }

  public async revalidateTag(tag: string) {
    if (globalThis.disableDynamoDBCache || globalThis.disableIncrementalCache) {
      return;
    }
    try {
      debug("revalidateTag", tag);
      // Find all keys with the given tag
      const paths = await globalThis.tagCache.getByTag(tag);
      debug("Items", paths);
      // Update all keys with the given tag with revalidatedAt set to now
      await globalThis.tagCache.writeTags(
        paths?.map((path) => ({
          path: path,
          tag: tag,
        })) ?? [],
      );
    } catch (e) {
      error("Failed to revalidate tag", e);
    }
  }
}
