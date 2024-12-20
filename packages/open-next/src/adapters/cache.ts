import { isBinaryContentType } from "../utils/binary";
import { debug, error, warn } from "./logger";

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
  kind: "ROUTE" | "APP_ROUTE";
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
  kind: "PAGE" | "PAGES";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  pageData: Object;
  status?: number;
  headers?: Record<string, undefined | string>;
}

interface IncrementalCachedAppPageValue {
  kind: "APP_PAGE";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  rscData: Buffer;
  headers?: Record<string, undefined | string | string[]>;
  postponed?: string;
  status?: number;
}

type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | IncrementalCachedAppPageValue
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

interface CacheHandlerValue {
  lastModified?: number;
  age?: number;
  cacheState?: string;
  value: IncrementalCacheValue | null;
}

function isFetchCache(
  options?:
    | boolean
    | {
        fetchCache?: boolean;
        kindHint?: "app" | "pages" | "fetch";
        kind?: "FETCH";
      },
): boolean {
  if (typeof options === "boolean") {
    return options;
  }
  if (typeof options === "object") {
    return (
      options.kindHint === "fetch" ||
      options.fetchCache ||
      options.kind === "FETCH"
    );
  }
  return false;
}
// We need to use globalThis client here as this class can be defined at load time in next 12 but client is not available at load time
export default class Cache {
  public async get(
    key: string,
    // fetchCache is for next 13.5 and above, kindHint is for next 14 and above and boolean is for earlier versions
    options?:
      | boolean
      | {
          fetchCache?: boolean;
          kindHint?: "app" | "pages" | "fetch";
          tags?: string[];
          softTags?: string[];
          kind?: "FETCH";
        },
  ) {
    if (globalThis.disableIncrementalCache) {
      return null;
    }

    const softTags = typeof options === "object" ? options.softTags : [];
    const tags = typeof options === "object" ? options.tags : [];
    return isFetchCache(options)
      ? this.getFetchCache(key, softTags, tags)
      : this.getIncrementalCache(key);
  }

  async getFetchCache(key: string, softTags?: string[], tags?: string[]) {
    debug("get fetch cache", { key, softTags, tags });
    try {
      const { value, lastModified } = await globalThis.incrementalCache.get(
        key,
        true,
      );

      const _lastModified = await globalThis.tagCache.getLastModified(
        key,
        lastModified,
      );
      if (_lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }

      if (value === undefined) return null;

      // For cases where we don't have tags, we need to ensure that the soft tags are not being revalidated
      // We only need to check for the path as it should already contain all the tags
      if ((tags ?? []).length === 0) {
        // Then we need to find the path for the given key
        const path = softTags?.find(
          (tag) =>
            tag.startsWith("_N_T_/") &&
            !tag.endsWith("layout") &&
            !tag.endsWith("page"),
        );
        if (path) {
          const pathLastModified = await globalThis.tagCache.getLastModified(
            path.replace("_N_T_/", ""),
            lastModified,
          );
          if (pathLastModified === -1) {
            // In case the path has been revalidated, we don't want to use the fetch cache
            return null;
          }
        }
      }

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

      const meta = cacheData?.meta;
      const _lastModified = await globalThis.tagCache.getLastModified(
        key,
        lastModified,
      );
      if (_lastModified === -1) {
        // If some tags are stale we need to force revalidation
        return null;
      }
      const requestId = globalThis.__openNextAls.getStore()?.requestId ?? "";
      globalThis.lastModified[requestId] = _lastModified;
      if (cacheData?.type === "route") {
        return {
          lastModified: _lastModified,
          value: {
            kind: globalThis.isNextAfter15 ? "APP_ROUTE" : "ROUTE",
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
      }
      if (cacheData?.type === "page" || cacheData?.type === "app") {
        if (globalThis.isNextAfter15 && cacheData?.type === "app") {
          return {
            lastModified: _lastModified,
            value: {
              kind: "APP_PAGE",
              html: cacheData.html,
              rscData: Buffer.from(cacheData.rsc),
              status: meta?.status,
              headers: meta?.headers,
              postponed: meta?.postponed,
            },
          } as CacheHandlerValue;
        }
        return {
          lastModified: _lastModified,
          value: {
            kind: globalThis.isNextAfter15 ? "PAGES" : "PAGE",
            html: cacheData.html,
            pageData:
              cacheData.type === "page" ? cacheData.json : cacheData.rsc,
            status: meta?.status,
            headers: meta?.headers,
          },
        } as CacheHandlerValue;
      }
      if (cacheData?.type === "redirect") {
        return {
          lastModified: _lastModified,
          value: {
            kind: "REDIRECT",
            props: cacheData.props,
          },
        } as CacheHandlerValue;
      }
      warn("Unknown cache type", cacheData);
      return null;
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
    // This one might not even be necessary anymore
    // Better be safe than sorry
    const detachedPromise = globalThis.__openNextAls
      .getStore()
      ?.pendingPromiseRunner.withResolvers<void>();
    try {
      if (data === null || data === undefined) {
        await globalThis.incrementalCache.delete(key);
      } else {
        switch (data.kind) {
          case "ROUTE":
          case "APP_ROUTE": {
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
            break;
          }
          case "PAGE":
          case "PAGES": {
            const { html, pageData, status, headers } = data;
            const isAppPath = typeof pageData === "string";
            if (isAppPath) {
              await globalThis.incrementalCache.set(
                key,
                {
                  type: "app",
                  html,
                  rsc: pageData,
                  meta: {
                    status,
                    headers,
                  },
                },
                false,
              );
            } else {
              await globalThis.incrementalCache.set(
                key,
                {
                  type: "page",
                  html,
                  json: pageData,
                },
                false,
              );
            }
            break;
          }
          case "APP_PAGE": {
            const { html, rscData, headers, status } = data;
            await globalThis.incrementalCache.set(
              key,
              {
                type: "app",
                html,
                rsc: rscData.toString("utf8"),
                meta: {
                  status,
                  headers,
                },
              },
              false,
            );
            break;
          }
          case "FETCH":
            await globalThis.incrementalCache.set<true>(key, data, true);
            break;
          case "REDIRECT":
            await globalThis.incrementalCache.set(
              key,
              {
                type: "redirect",
                props: data.props,
              },
              false,
            );
            break;
          case "IMAGE":
            // Not implemented
            break;
        }
      }
      // Write derivedTags to dynamodb
      // If we use an in house version of getDerivedTags in build we should use it here instead of next's one
      const derivedTags: string[] =
        data?.kind === "FETCH"
          ? (ctx?.tags ?? data?.data?.tags ?? []) // before version 14 next.js used data?.data?.tags so we keep it for backward compatibility
          : data?.kind === "PAGE"
            ? (data.headers?.["x-next-cache-tags"]?.split(",") ?? [])
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
            // In case the tags are not there we just need to create them
            // but we don't want them to return from `getLastModified` as they are not stale
            revalidatedAt: 1,
          })),
        );
      }
      debug("Finished setting cache");
    } catch (e) {
      error("Failed to set cache", e);
    } finally {
      // We need to resolve the promise even if there was an error
      detachedPromise?.resolve();
    }
  }

  public async revalidateTag(tags: string | string[]) {
    if (globalThis.disableDynamoDBCache || globalThis.disableIncrementalCache) {
      return;
    }
    try {
      const _tags = Array.isArray(tags) ? tags : [tags];
      for (const tag of _tags) {
        debug("revalidateTag", tag);
        // Find all keys with the given tag
        const paths = await globalThis.tagCache.getByTag(tag);
        debug("Items", paths);
        const toInsert = paths.map((path) => ({
          path,
          tag,
        }));

        // If the tag is a soft tag, we should also revalidate the hard tags
        if (tag.startsWith("_N_T_/")) {
          for (const path of paths) {
            // We need to find all hard tags for a given path
            const _tags = await globalThis.tagCache.getByPath(path);
            const hardTags = _tags.filter((t) => !t.startsWith("_N_T_/"));
            // For every hard tag, we need to find all paths and revalidate them
            for (const hardTag of hardTags) {
              const _paths = await globalThis.tagCache.getByTag(hardTag);
              debug({ hardTag, _paths });
              toInsert.push(
                ..._paths.map((path) => ({
                  path,
                  tag: hardTag,
                })),
              );
            }
          }
        }

        // Update all keys with the given tag with revalidatedAt set to now
        await globalThis.tagCache.writeTags(toInsert);

        // We can now invalidate all paths in the CDN
        // This only applies to `revalidateTag`, not to `res.revalidate()`
        const uniquePaths = Array.from(
          new Set(
            toInsert
              // We need to filter fetch cache key as they are not in the CDN
              .filter((t) => t.tag.startsWith("_N_T_/"))
              .map((t) => `/${t.path}`),
          ),
        );
        if (uniquePaths.length > 0) {
          await globalThis.cdnInvalidationHandler.invalidatePaths(
            uniquePaths.map((path) => ({
              path,
              // Here we can be sure that the path is from app router
              isAppRouter: true,
            })),
          );
        }
      }
    } catch (e) {
      error("Failed to revalidate tag", e);
    }
  }
}
