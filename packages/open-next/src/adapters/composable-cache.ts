import type {
  ComposableCacheEntry,
  ComposableCacheHandler,
  StoredComposableCacheEntry,
} from "types/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

export default {
  async get(cacheKey: string) {
    try {
      // TODO: update the type of the incremental cache
      const result = (await globalThis.incrementalCache.get(
        cacheKey,
        true,
      )) as unknown as StoredComposableCacheEntry;

      debug("composable cache result", result);

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
    await globalThis.incrementalCache.set(cacheKey, {
      ...entry,
      value: valueToStore,
    } as any);
  },

  async refreshTags() {
    // We don't do anything for now, do we want to do something here ???
    return;
  },
  async getExpiration(...tags: string[]) {
    if (globalThis.tagCache.mode === "nextMode") {
      return globalThis.tagCache.getLastRevalidated(tags);
    }
    //TODO: Not supported for now - I'll need to figure out a way, maybe we'd want to merge both type into one
    return 0;
  },
  async expireTags(...tags: string[]) {
    if (globalThis.tagCache.mode === "nextMode") {
      return globalThis.tagCache.writeTags(tags);
    }
  },
} satisfies ComposableCacheHandler;
