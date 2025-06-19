import type {
  CacheValue,
  OriginalTagCacheWriteInput,
  WithLastModified,
} from "types/overrides";

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
    return await globalThis.tagCache.hasBeenRevalidated(tags, lastModified);
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
    return value.meta?.headers?.["x-next-cache-tags"]?.split(",") ?? [];
  } catch (e) {
    return [];
  }
}

export function executeTagCacheWrite() {
  const store = globalThis.__openNextAls.getStore();
  if (!store || globalThis.openNextConfig.dangerous?.disableTagCache) {
    return;
  }
  const tagCache = globalThis.tagCache;
  const tagsToWrite = Array.from(store.pendingTagToWrite.values());

  store.pendingPromiseRunner.add(tagCache.writeTags(tagsToWrite as any));
}

export function addTagToWrite(
  tags: (string | OriginalTagCacheWriteInput)[],
): void {
  const store = globalThis.__openNextAls.getStore();
  if (!store || globalThis.openNextConfig.dangerous?.disableTagCache) {
    return;
  }
  for (const t of tags) {
    if (typeof t === "string") {
      store.pendingTagToWrite.set(t, t);
    } else {
      store.pendingTagToWrite.set(
        // The primary key is only the path and the tag, not the revalidatedAt
        JSON.stringify({
          tag: t.tag,
          path: t.path,
        }),
        {
          ...t,
        },
      );
    }
  }
}
