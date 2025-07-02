import type {
  CacheHandlerValue,
  IncrementalCacheContext,
  IncrementalCacheValue,
} from "types/cache";
import {
  createCacheKey,
  getTagsFromValue,
  hasBeenRevalidated,
  writeTags,
} from "utils/cache";
import { isBinaryContentType } from "../utils/binary";
import { debug, error, warn } from "./logger";

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
    baseKey: string,
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
    if (globalThis.openNextConfig.dangerous?.disableIncrementalCache) {
      return null;
    }

    const softTags = typeof options === "object" ? options.softTags : [];
    const tags = typeof options === "object" ? options.tags : [];
    const isDataCache = isFetchCache(options);
    return isDataCache
      ? this.getFetchCache(baseKey, softTags, tags)
      : this.getIncrementalCache(baseKey);
  }

  async getFetchCache(baseKey: string, softTags?: string[], tags?: string[]) {
    debug("get fetch cache", { baseKey, softTags, tags });
    try {
      const key = createCacheKey(baseKey, true);
      const cachedEntry = await globalThis.incrementalCache.get(key, "fetch");

      if (cachedEntry?.value === undefined) return null;

      const _tags = [...(tags ?? []), ...(softTags ?? [])];
      const _lastModified = cachedEntry.lastModified ?? Date.now();
      const _hasBeenRevalidated = await hasBeenRevalidated(
        baseKey,
        _tags,
        cachedEntry,
      );

      if (_hasBeenRevalidated) return null;

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
          const hasPathBeenUpdated = await hasBeenRevalidated(
            path.replace("_N_T_/", ""),
            [],
            cachedEntry,
          );
          if (hasPathBeenUpdated) {
            // In case the path has been revalidated, we don't want to use the fetch cache
            return null;
          }
        }
      }

      return {
        lastModified: _lastModified,
        value: cachedEntry.value,
      } as CacheHandlerValue;
    } catch (e) {
      // We can usually ignore errors here as they are usually due to cache not being found
      debug("Failed to get fetch cache", e);
      return null;
    }
  }

  async getIncrementalCache(
    baseKey: string,
  ): Promise<CacheHandlerValue | null> {
    try {
      const key = createCacheKey(baseKey, false);
      const cachedEntry = await globalThis.incrementalCache.get(key, "cache");

      if (!cachedEntry?.value) {
        return null;
      }

      const cacheData = cachedEntry.value;

      const meta = cacheData.meta;
      const tags = getTagsFromValue(cacheData);
      const _lastModified = cachedEntry.lastModified ?? Date.now();
      const _hasBeenRevalidated = await hasBeenRevalidated(
        baseKey,
        tags,
        cachedEntry,
      );
      if (_hasBeenRevalidated) return null;

      const store = globalThis.__openNextAls.getStore();
      if (store) {
        store.lastModified = _lastModified;
      }

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
    baseKey: string,
    data?: IncrementalCacheValue,
    ctx?: IncrementalCacheContext,
  ): Promise<void> {
    if (globalThis.openNextConfig.dangerous?.disableIncrementalCache) {
      return;
    }
    const key = createCacheKey(baseKey, data?.kind === "FETCH");
    // This one might not even be necessary anymore
    // Better be safe than sorry
    const detachedPromise = globalThis.__openNextAls
      .getStore()
      ?.pendingPromiseRunner.withResolvers<void>();
    try {
      if (data === null || data === undefined) {
        // only case where we delete the cache is for ISR/SSG cache
        await globalThis.incrementalCache.delete(key);
      } else {
        const revalidate = this.extractRevalidateForSet(ctx);
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
                revalidate,
              },
              "cache",
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
                  revalidate,
                },
                "cache",
              );
            } else {
              await globalThis.incrementalCache.set(
                key,
                {
                  type: "page",
                  html,
                  json: pageData,
                  revalidate,
                },
                "cache",
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
                revalidate,
              },
              "cache",
            );
            break;
          }
          case "FETCH":
            await globalThis.incrementalCache.set(key, data, "fetch");
            break;
          case "REDIRECT":
            await globalThis.incrementalCache.set(
              key,
              {
                type: "redirect",
                props: data.props,
                revalidate,
              },
              "cache",
            );
            break;
          case "IMAGE":
            // Not implemented
            break;
        }
      }

      await this.updateTagsOnSet(baseKey, data, ctx);
      debug("Finished setting cache");
    } catch (e) {
      error("Failed to set cache", e);
    } finally {
      // We need to resolve the promise even if there was an error
      detachedPromise?.resolve();
    }
  }

  public async revalidateTag(tags: string | string[]) {
    const config = globalThis.openNextConfig.dangerous;
    if (config?.disableTagCache || config?.disableIncrementalCache) {
      return;
    }
    const _tags = Array.isArray(tags) ? tags : [tags];
    if (_tags.length === 0) {
      return;
    }

    try {
      if (globalThis.tagCache.mode === "nextMode") {
        const paths = (await globalThis.tagCache.getPathsByTags?.(_tags)) ?? [];

        await writeTags(_tags);
        if (paths.length > 0) {
          // TODO: we should introduce a new method in cdnInvalidationHandler to invalidate paths by tags for cdn that supports it
          // It also means that we'll need to provide the tags used in every request to the wrapper or converter.
          await globalThis.cdnInvalidationHandler.invalidatePaths(
            paths.map((path) => ({
              initialPath: path,
              rawPath: path,
              resolvedRoutes: [
                {
                  route: path,
                  // TODO: ideally here we should check if it's an app router page or route
                  type: "app",
                },
              ],
            })),
          );
        }
        return;
      }

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
        await writeTags(toInsert);

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
              initialPath: path,
              rawPath: path,
              resolvedRoutes: [
                {
                  route: path,
                  // TODO: ideally here we should check if it's an app router page or route
                  type: "app",
                },
              ],
            })),
          );
        }
      }
    } catch (e) {
      error("Failed to revalidate tag", e);
    }
  }

  // TODO: We should delete/update tags in this method
  // This will require an update to the tag cache interface
  private async updateTagsOnSet(
    key: string,
    data?: IncrementalCacheValue,
    ctx?: IncrementalCacheContext,
  ) {
    if (
      globalThis.openNextConfig.dangerous?.disableTagCache ||
      globalThis.tagCache.mode === "nextMode" ||
      // Here it means it's a delete
      !data
    ) {
      return;
    }
    // Write derivedTags to the tag cache
    // If we use an in house version of getDerivedTags in build we should use it here instead of next's one
    const derivedTags: string[] =
      data?.kind === "FETCH"
        ? //@ts-expect-error - On older versions of next, ctx was a number, but for these cases we use data?.data?.tags
          (ctx?.tags ?? data?.data?.tags ?? []) // before version 14 next.js used data?.data?.tags so we keep it for backward compatibility
        : data?.kind === "PAGE"
          ? (data.headers?.["x-next-cache-tags"]?.split(",") ?? [])
          : [];
    debug("derivedTags", derivedTags);

    // Get all tags stored in dynamodb for the given key
    // If any of the derived tags are not stored in dynamodb for the given key, write them
    const storedTags = await globalThis.tagCache.getByPath(key);
    const tagsToWrite = derivedTags.filter((tag) => !storedTags.includes(tag));
    if (tagsToWrite.length > 0) {
      await writeTags(
        tagsToWrite.map((tag) => ({
          path: key,
          tag: tag,
          // In case the tags are not there we just need to create them
          // but we don't want them to return from `getLastModified` as they are not stale
          revalidatedAt: 1,
        })),
      );
    }
  }

  private extractRevalidateForSet(
    ctx?: IncrementalCacheContext,
  ): number | false | undefined {
    if (ctx === undefined) {
      return undefined;
    }
    if (typeof ctx === "number" || ctx === false) {
      return ctx;
    }
    if ("revalidate" in ctx) {
      return ctx.revalidate;
    }
    if ("cacheControl" in ctx) {
      return ctx.cacheControl?.revalidate;
    }
    return undefined;
  }
}
