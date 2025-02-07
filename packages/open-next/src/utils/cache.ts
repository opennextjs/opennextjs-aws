import type { CacheValue } from "types/overrides";

export async function hasBeenRevalidated(
  key: string,
  tags: string[],
  lastModified?: number,
): Promise<boolean> {
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
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

export function getTagsFromValue(value?: CacheValue<false>) {
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
