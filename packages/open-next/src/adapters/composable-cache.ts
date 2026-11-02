import type { ComposableCacheEntry, ComposableCacheHandler } from "types/cache";
import type { CacheValue, OriginalTagCache } from "types/overrides";
import { getComposableCacheStorageKey, isStale, writeTags } from "utils/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

/**
 * In-flight writes are tracked per request, not per module.
 *
 * A module-scope map is per isolate. On a runtime that serves one request per
 * sandbox that is the same as per request, but on a runtime that serves many
 * concurrent requests from one isolate (e.g. Cloudflare Workers) a pending
 * write promise created in request A would be handed to request B. If A's
 * context is torn down before the write settles, B awaits a promise that never
 * resolves, `.finally()` never runs, and the key stays poisoned for the life of
 * the isolate.
 *
 * `RequestCache` is the per-request store the tag caches already use for this.
 * Scoping the map to it keeps the read-coherence a `get` needs for a write in
 * flight from the same render while making a cross-request share impossible.
 * With no ALS store (e.g. at build time) the dedupe is skipped and `get` falls
 * through to the incremental cache.
 *
 * The map is keyed by the cache key provided by Next.js: it is an in-memory exact string
 * comparison so there is no need to use the storage key (see `getComposableCacheStorageKey`).
 */
const PENDING_WRITES_CACHE_KEY = "composable-cache:pending-writes";

const getPendingWritePromiseMap = () =>
  globalThis.__openNextAls
    ?.getStore()
    ?.requestCache?.getOrCreate<string, Promise<CacheValue<"composable">>>(
      PENDING_WRITES_CACHE_KEY,
    );

export default {
  /**
   * Reads a composable cache entry.
   *
   * The incremental cache and the tag cache are accessed with a key derived from `cacheKey`,
   * see `getComposableCacheStorageKey`.
   *
   * @param cacheKey The cache key provided by Next.js
   * @returns The cache entry, or `undefined` on a miss or when the entry has been revalidated.
   * Errors are caught and reported as a miss.
   */
  async get(cacheKey: string) {
    try {
      // We first check if we have a pending write for this cache key
      // If we do, we return the pending promise instead of fetching the cache
      const pendingWritePromiseMap = getPendingWritePromiseMap();
      if (pendingWritePromiseMap?.has(cacheKey)) {
        const stored = pendingWritePromiseMap.get(cacheKey);
        if (stored) {
          return stored.then((entry) => ({
            ...entry,
            value: toReadableStream(entry.value),
          }));
        }
      }
      const storageKey = getComposableCacheStorageKey(cacheKey);
      const result = await globalThis.incrementalCache.get(
        storageKey,
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
          : await isStale(storageKey, result.value.tags, result.lastModified);
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
              storageKey,
              result.lastModified,
            )) === -1;
        if (hasBeenRevalidated) return undefined;

        // Check if tags are stale – entry is valid but needs background revalidation
        const isCacheStale = result.shouldBypassTagCache
          ? false
          : await isStale(storageKey, result.value.tags, result.lastModified);
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

  /**
   * Writes a composable cache entry.
   *
   * The incremental cache and the tag cache are accessed with a key derived from `cacheKey`,
   * see `getComposableCacheStorageKey`.
   *
   * @param cacheKey The cache key provided by Next.js
   * @param pendingEntry The entry to store, resolves once the cached function has completed
   * @throws When the entry can not be resolved or when the incremental cache or tag cache write fails
   */
  async set(cacheKey: string, pendingEntry: Promise<ComposableCacheEntry>) {
    const promiseEntry = pendingEntry.then(async (entry) => ({
      ...entry,
      value: await fromReadableStream(entry.value),
    }));
    const pendingWritePromiseMap = getPendingWritePromiseMap();
    pendingWritePromiseMap?.set(cacheKey, promiseEntry);

    const entry = await promiseEntry.finally(() => {
      pendingWritePromiseMap?.delete(cacheKey);
    });
    const storageKey = getComposableCacheStorageKey(cacheKey);
    await globalThis.incrementalCache.set(
      storageKey,
      {
        ...entry,
        value: entry.value,
      },
      "composable",
    );
    if (globalThis.tagCache.mode === "original") {
      const storedTags = await globalThis.tagCache.getByPath(storageKey);
      const tagsToWrite = entry.tags.filter((tag) => !storedTags.includes(tag));
      if (tagsToWrite.length > 0) {
        await writeTags(tagsToWrite.map((tag) => ({ tag, path: storageKey })));
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
   * durations.expire is in seconds, but we convert it to milliseconds for storage and comparison.
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
              expire:
                durations.expire !== undefined
                  ? now + durations.expire * 1000
                  : undefined,
            };
          }
          // Default: immediate expiry, no grace period
          return { tag, expire: now };
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
                  expire:
                    durations.expire !== undefined
                      ? now + durations.expire * 1000
                      : undefined,
                };
              }
              return { path, tag, expire: now };
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
