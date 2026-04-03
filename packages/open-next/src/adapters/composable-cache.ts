import type { ComposableCacheEntry, ComposableCacheHandler } from "types/cache";
import type { CacheValue, OriginalTagCache } from "types/overrides";
import { isStale, writeTags } from "utils/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

const pendingWritePromiseMap = new Map<
  string,
  Promise<CacheValue<"composable">>
>();

export default {
  async get(cacheKey: string) {
    try {
      // We first check if we have a pending write for this cache key
      // If we do, we return the pending promise instead of fetching the cache
      if (pendingWritePromiseMap.has(cacheKey)) {
        const stored = pendingWritePromiseMap.get(cacheKey);
        if (stored) {
          return stored.then((entry) => ({
            ...entry,
            value: toReadableStream(entry.value),
          }));
        }
      }
      const result = await globalThis.incrementalCache.get(
        cacheKey,
        "composable",
      );
      if (!result?.value?.value) {
        return undefined;
      }

      debug("composable cache result", result);

      let revalidate = result.value.revalidate;
      if (
        globalThis.tagCache.mode === "nextMode" &&
        result.value.tags.length > 0
      ) {
        // We need to check if the tags associated with this entry has been revalidated
        const hasBeenRevalidated = result.shouldBypassTagCache
          ? false
          : await globalThis.tagCache.hasBeenRevalidated(
              result.value.tags,
              result.lastModified,
            );
        if (hasBeenRevalidated) return undefined;

        // Check if tags are stale – entry is valid but needs background revalidation
        const isCacheStale = result.shouldBypassTagCache
          ? false
          : await isStale(
              cacheKey,
              result.value.tags,
              result.lastModified,
            );
        if (isCacheStale) {
          revalidate = -1;
        }
      } else if (
        globalThis.tagCache.mode === "original" ||
        globalThis.tagCache.mode === undefined
      ) {
        const hasBeenRevalidated = result.shouldBypassTagCache
          ? false
          : (await globalThis.tagCache.getLastModified(
              cacheKey,
              result.lastModified,
            )) === -1;
        if (hasBeenRevalidated) return undefined;

        // Check if tags are stale – entry is valid but needs background revalidation
        const isCacheStale = result.shouldBypassTagCache
          ? false
          : await isStale(
              cacheKey,
              result.value.tags,
              result.lastModified,
            );
        if (isCacheStale) {
          revalidate = -1;
        }
      }

      return {
        ...result.value,
        revalidate,
        value: toReadableStream(result.value.value),
      };
    } catch (e) {
      debug("Cannot read composable cache entry");
      return undefined;
    }
  },

  async set(cacheKey: string, pendingEntry: Promise<ComposableCacheEntry>) {
    const promiseEntry = pendingEntry.then(async (entry) => ({
      ...entry,
      value: await fromReadableStream(entry.value),
    }));
    pendingWritePromiseMap.set(cacheKey, promiseEntry);

    const entry = await promiseEntry.finally(() => {
      pendingWritePromiseMap.delete(cacheKey);
    });
    await globalThis.incrementalCache.set(
      cacheKey,
      {
        ...entry,
        value: entry.value,
      },
      "composable",
    );
    if (globalThis.tagCache.mode === "original") {
      const storedTags = await globalThis.tagCache.getByPath(cacheKey);
      const tagsToWrite = entry.tags.filter((tag) => !storedTags.includes(tag));
      if (tagsToWrite.length > 0) {
        await writeTags(tagsToWrite.map((tag) => ({ tag, path: cacheKey })));
      }
    }
  },

  async refreshTags() {
    // We don't do anything for now, do we want to do something here ???
    return;
  },

  /**
   * The signature has changed in Next.js 16
   * - Before Next.js 16, the method takes `...tags: string[]`
   * - From Next.js 16, the method takes `tags: string[]`
   */
  async getExpiration(...tags: string[] | string[][]) {
    if (globalThis.tagCache.mode === "nextMode") {
      // Use `.flat()` to accommodate both signatures
      return globalThis.tagCache.getLastRevalidated(tags.flat());
    }
    // We always return 0 here, original tag cache are handled directly in the get part
    // TODO: We need to test this more, i'm not entirely sure that this is working as expected
    return 0;
  },

  /**
   * This method is only used before Next.js 16
   */
  async expireTags(...tags: string[]) {
    if (globalThis.tagCache.mode === "nextMode") {
      return writeTags(tags);
    }
    const tagCache = globalThis.tagCache;
    const revalidatedAt = Date.now();
    // For the original mode, we have more work to do here.
    // We need to find all paths linked to to these tags
    const pathsToUpdate = await Promise.all(
      tags.map(async (tag) => {
        const paths = await tagCache.getByTag(tag);
        return paths.map((path) => ({
          path,
          tag,
          revalidatedAt,
        }));
      }),
    );
    // We need to deduplicate paths, we use a set for that
    const setToWrite = new Set<{ path: string; tag: string }>();
    for (const entry of pathsToUpdate.flat()) {
      setToWrite.add(entry);
    }
    await writeTags(Array.from(setToWrite));
  },

  // This one is necessary for older versions of next
  async receiveExpiredTags(...tags: string[]) {
    // This function does absolutely nothing
    return;
  },

  /**
   * Added in Next.js 16. Updates tags with optional stale/expire durations.
   * Mirrors the logic in `Cache.revalidateTag` but without CDN invalidation
   * since composable cache keys are not URL paths.
   *
   * When `durations` is provided, marks tags as stale immediately and optionally
   * sets an expiry timestamp. When omitted, immediately expires tags (no grace period).
   */
  async updateTags(tags: string[], durations?: { expire?: number }) {
    const config = globalThis.openNextConfig.dangerous;
    if (config?.disableTagCache || config?.disableIncrementalCache) {
      return;
    }
    if (tags.length === 0) {
      return;
    }
    try {
      const now = Date.now();
      if (globalThis.tagCache.mode === "nextMode") {
        const tagsToWrite = tags.map((tag) => {
          if (durations) {
            return {
              tag,
              stale: now,
              expiry:
                durations.expire !== undefined
                  ? now + durations.expire * 1000
                  : undefined,
            };
          }
          // Default: immediate expiry, no grace period
          return { tag, expiry: now };
        });
        await writeTags(tagsToWrite);
      } else {
        // Original mode: resolve tag → path mappings first
        const originalTagCache = globalThis.tagCache as OriginalTagCache;
        const pathsPerTag = await Promise.all(
          tags.map(async (tag) => {
            const paths = await originalTagCache.getByTag(tag);
            return paths.map((path: string) => {
              if (durations) {
                return {
                  path,
                  tag,
                  stale: now,
                  expiry:
                    durations.expire !== undefined
                      ? now + durations.expire * 1000
                      : undefined,
                };
              }
              return { path, tag, expiry: now };
            });
          }),
        );
        const toWrite = pathsPerTag.flat();
        if (toWrite.length > 0) {
          await writeTags(toWrite);
        }
      }
    } catch (e) {
      debug("Failed to update tags", e);
    }
  },
} satisfies ComposableCacheHandler;
