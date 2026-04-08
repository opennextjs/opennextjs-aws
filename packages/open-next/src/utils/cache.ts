import type {
  CacheValue,
  NextModeTagCacheWriteInput,
  OriginalTagCacheWriteInput,
  WithLastModified,
} from "types/overrides";
import { debug } from "../adapters/logger";
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
      : ((await globalThis.tagCache.isStale?.(tags, lastModified)) ??
          false);
  }
  return (await globalThis.tagCache.isStale?.(key, lastModified)) ?? false;
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
      value.meta?.headers?.["x-next-cache-tags"]?.split(",") ?? [];
    delete value.meta?.headers?.["x-next-cache-tags"];
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
