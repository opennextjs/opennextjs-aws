import type {
  CacheValue,
  OriginalTagCacheWriteInput,
  WithLastModified,
} from "types/overrides";
import { debug } from "../adapters/logger";

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
    const cacheTags =
      value.meta?.headers?.["x-next-cache-tags"]?.split(",") ?? [];
    delete value.meta?.headers?.["x-next-cache-tags"];
    return cacheTags;
  } catch (e) {
    return [];
  }
}

function getTagKey(tag: string | OriginalTagCacheWriteInput): string {
  if (typeof tag === "string") {
    return tag;
  }
  return JSON.stringify({
    tag: tag.tag,
    path: tag.path,
  });
}

export async function writeTags(
  tags: (string | OriginalTagCacheWriteInput)[],
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
