import type {
  CacheValue,
  NextModeTagCacheWriteInput,
  OriginalTagCacheWriteInput,
  WithLastModified,
} from "types/overrides";
import { debug } from "../adapters/logger";
import { CACHE_TAGS_HEADER } from "./cacheHeaders";
import { compareSemver } from "./semver";
/**
 *
 * @param key The key for that specific cache entry
 * @param tags Array of tags associated with that cache entry
 * @param lastModified Time of the last update to the cache entry
 * @returns A boolean indicating whether the cache entry has become stale -
 * A cache entry is considered stale if at least one of its associated tags has been revalidated since the `lastModified` time, but none of them has expired yet.
 * In this case, the cache entry is still valid and can be served, but it should trigger a background revalidation to update the cache.
 */
export async function isStale(
  key: string,
  tags: string[],
  lastModified?: number,
): Promise<boolean> {
  // SWR for revalidateTag has been implemented starting from Next.js 16
  if (!compareSemver(globalThis.nextVersion, ">=", "16.0.0")) {
    return false;
  }
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0
      ? false
      : ((await globalThis.tagCache.isStale?.(tags, lastModified)) ?? false);
  }
  return (await globalThis.tagCache.isStale?.(key, lastModified)) ?? false;
}

/**
 * Next.js has no explicit way for a cache handler to report an entry as stale,
 * the only lever we have is the `lastModified` we hand back to the incremental cache.
 *
 * Up to Next 16.2 we return `1` (i.e. right after the epoch), which is enough for Next to
 * compute `revalidateAfter` in the past and mark the entry as stale.
 * Starting with Next 16.3 the incremental cache also compares `lastModified + expire` to now, and
 * forces a blocking revalidation (`isStale === -1`, surfacing as `x-nextjs-cache: REVALIDATED`)
 * when that is in the past. An epoch based value always trips that check, so from that version on
 * we go back just far enough for the entry to be stale while remaining inside its expire window.
 *
 * @param revalidate The revalidate value stored alongside the cache entry, in seconds
 * @returns The `lastModified` to report to Next.js for a stale entry
 */
export function getStaleLastModified(revalidate?: number | false): number {
  // The `expire` check only exists from Next 16.3, before that the sentinel is what Next expects.
  if (!compareSemver(globalThis.nextVersion, ">=", "16.3.0")) {
    return 1;
  }
  if (typeof revalidate !== "number") {
    // Without a revalidate value Next cannot derive an expire time either,
    // so the historical sentinel is still safe here.
    return 1;
  }
  // 1ms past the revalidate window. `expire` is always >= `revalidate`, so the entry is
  // stale without being expired (when both are equal, being expired is the correct outcome).
  return Date.now() - revalidate * 1000 - 1;
}

/**
 * @param key The key for that specific cache entry
 * @param tags Array of tags associated with that cache entry
 * @param cacheEntry The cache entry with its last modified time and value
 * @returns A boolean indicating whether the cache entry has been revalidated -
 * A cache entry is considered revalidated if at least one of its associated tags has been revalidated
 * after the entry's `lastModified` time, meaning the cached data is stale and must be re-fetched.
 * For Next 16+ you need {@link isStale}, to know if a revalidated entry is stale (valid but needs background revalidation) or expired (needs to be re-fetched immediately).
 * Without it, we consider all revalidated entries as expired, which means that they will be re-fetched immediately without a chance to be served stale.
 */
export async function hasBeenRevalidated(
  key: string,
  tags: string[],
  cacheEntry: WithLastModified<CacheValue<any>>,
): Promise<boolean> {
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  const value = cacheEntry.value;
  if (!value) {
    // We should never reach this point
    return true;
  }
  if ("type" in cacheEntry && cacheEntry.type === "page") {
    return false;
  }
  const lastModified = cacheEntry.lastModified ?? Date.now();
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0
      ? false
      : await globalThis.tagCache.hasBeenRevalidated(tags, lastModified);
  }
  // TODO: refactor this, we should introduce a new method in the tagCache interface so that both implementations use hasBeenRevalidated
  const _lastModified = await globalThis.tagCache.getLastModified(
    key,
    lastModified,
  );
  return _lastModified === -1;
}

export function getTagsFromValue(value?: CacheValue<"cache">) {
  if (!value) {
    return [];
  }
  // The try catch is necessary for older version of next.js that may fail on this
  try {
    const cacheTags =
      value.meta?.headers?.[CACHE_TAGS_HEADER]?.split(",") ?? [];
    delete value.meta?.headers?.[CACHE_TAGS_HEADER];
    return cacheTags;
  } catch (e) {
    return [];
  }
}

function getTagKey(
  tag: string | OriginalTagCacheWriteInput | NextModeTagCacheWriteInput,
): string {
  if (typeof tag === "string") {
    return tag;
  }
  // For OriginalTagCacheWriteInput, include path in the key
  if ("path" in tag) {
    return JSON.stringify({
      tag: tag.tag,
      path: tag.path,
    });
  }
  // For NextModeTagCacheWriteInput, just use the tag
  return tag.tag;
}

export async function writeTags(
  tags: (string | OriginalTagCacheWriteInput | NextModeTagCacheWriteInput)[],
): Promise<void> {
  const store = globalThis.__openNextAls.getStore();
  debug("Writing tags", tags, store);
  if (!store || globalThis.openNextConfig.dangerous?.disableTagCache) {
    return;
  }
  const tagsToWrite = tags.filter((t) => {
    const tagKey = getTagKey(t);
    const shouldWrite = !store.writtenTags.has(tagKey);
    // We preemptively add the tag to the writtenTags set
    // to avoid writing the same tag multiple times in the same request
    if (shouldWrite) {
      store.writtenTags.add(tagKey);
    }
    return shouldWrite;
  });
  if (tagsToWrite.length === 0) {
    return;
  }

  // Here we know that we have the correct type
  await globalThis.tagCache.writeTags(tagsToWrite as any);
}

const INCREMENTAL_CACHE_MEMO = "incremental-cache:get";
const INCREMENTAL_CACHE_GENERATION = "incremental-cache:gen";
type MemoEntry = WithLastModified<CacheValue<"cache">> | null;

/**
 * The raw incremental cache reads of the current request, shared by the cache interceptor and the
 * cache handler so that a request reads the same key from the store only once.
 */
function incrementalCacheMemo() {
  return globalThis.__openNextAls
    .getStore()
    ?.requestCache.getOrCreate<string, MemoEntry>(INCREMENTAL_CACHE_MEMO);
}

/**
 * Per key generation, bumped by every write and delete. A read that spans an invalidation must not
 * memoize what it read before that invalidation.
 */
function incrementalCacheGenerations() {
  return globalThis.__openNextAls
    .getStore()
    ?.requestCache.getOrCreate<string, number>(INCREMENTAL_CACHE_GENERATION);
}

/**
 * Readers get their own shallow copy: `getTagsFromValue` strips the cache tags header from the entry
 * in place, and one reader must not strip it for the other reader of the same request.
 */
function copyMemoEntry(entry: MemoEntry): MemoEntry {
  if (!entry?.value) {
    return entry;
  }
  const { value, ...rest } = entry;
  const headers = value.meta?.headers;
  return {
    ...rest,
    value: {
      ...value,
      ...(headers
        ? { meta: { ...value.meta, headers: { ...headers } } }
        : { meta: value.meta }),
    },
  } as MemoEntry;
}

/** Reads the incremental cache, reusing the value another reader already fetched in this request. */
export async function getIncrementalCacheEntry(
  key: string,
): Promise<MemoEntry> {
  const memo = incrementalCacheMemo();
  if (memo?.has(key)) {
    return copyMemoEntry(memo.get(key) ?? null);
  }
  const generations = incrementalCacheGenerations();
  const generation = generations?.get(key) ?? 0;
  const entry = (await globalThis.incrementalCache.get(key, "cache")) ?? null;
  // The key may have been written or deleted while the read was in flight
  if ((generations?.get(key) ?? 0) === generation) {
    memo?.set(key, entry);
  }
  return copyMemoEntry(entry);
}

/** Marks a key as resolved to a miss, used to carry the interceptor's decision over to the handler. */
export function markIncrementalCacheMiss(key: string): void {
  incrementalCacheMemo()?.set(key, null);
}

/** Drops the memoized read of a key that was just written or deleted. */
export function clearIncrementalCacheEntry(key: string): void {
  incrementalCacheMemo()?.delete(key);
  const generations = incrementalCacheGenerations();
  generations?.set(key, (generations.get(key) ?? 0) + 1);
}

/**
 * Internal header used to carry a cache interceptor miss from an external middleware to the handler.
 * It is declared here rather than next to the other internal headers because `routingHandler` imports
 * the interceptor, and the prefix still makes the routing layer strip it from incoming requests.
 */
export const INTERNAL_HEADER_CACHE_MISS = "x-opennext-cache-miss";

/**
 * Consumes the interceptor handoff: only the external middleware is trusted to send it, the same way
 * the request id is. In internal middleware mode the memo already lives in this request context.
 */
export function seedIncrementalCacheMissFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  if (!globalThis.openNextConfig.middleware?.external) {
    return;
  }
  const value = headers[INTERNAL_HEADER_CACHE_MISS];
  if (typeof value !== "string") {
    return;
  }
  delete headers[INTERNAL_HEADER_CACHE_MISS];
  let key: string;
  try {
    key = decodeURIComponent(value);
  } catch {
    // A caller that bypasses the middleware can send a malformed value; ignore it and read normally
    return;
  }
  markIncrementalCacheMiss(key);
}
