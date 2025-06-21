import type { ComposableCacheEntry, ComposableCacheHandler } from "types/cache";
import { writeTags } from "utils/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

export default {
  async get(cacheKey: string) {
    try {
      const result = await globalThis.incrementalCache.get(
        cacheKey,
        "composable",
      );
      if (!result?.value?.value) {
        return undefined;
      }

      debug("composable cache result", result);

      // We need to check if the tags associated with this entry has been revalidated
      if (
        globalThis.tagCache.mode === "nextMode" &&
        result.value.tags.length > 0
      ) {
        const hasBeenRevalidated = await globalThis.tagCache.hasBeenRevalidated(
          result.value.tags,
          result.lastModified,
        );
        if (hasBeenRevalidated) return undefined;
      } else if (
        globalThis.tagCache.mode === "original" ||
        globalThis.tagCache.mode === undefined
      ) {
        const hasBeenRevalidated =
          (await globalThis.tagCache.getLastModified(
            cacheKey,
            result.lastModified,
          )) === -1;
        if (hasBeenRevalidated) return undefined;
      }

      return {
        ...result.value,
        value: toReadableStream(result.value.value),
      };
    } catch (e) {
      debug("Cannot read composable cache entry");
      return undefined;
    }
  },

  async set(cacheKey: string, pendingEntry: Promise<ComposableCacheEntry>) {
    const entry = await pendingEntry;
    const valueToStore = await fromReadableStream(entry.value);
    await globalThis.incrementalCache.set(
      cacheKey,
      {
        ...entry,
        value: valueToStore,
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
  async getExpiration(...tags: string[]) {
    if (globalThis.tagCache.mode === "nextMode") {
      return globalThis.tagCache.getLastRevalidated(tags);
    }
    // We always return 0 here, original tag cache are handled directly in the get part
    // TODO: We need to test this more, i'm not entirely sure that this is working as expected
    return 0;
  },
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
} satisfies ComposableCacheHandler;
