import type { ComposableCacheEntry, ComposableCacheHandler } from "types/cache";
import { writeTags } from "utils/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

const pendingWritePromiseMap = new Map<string, Promise<ComposableCacheEntry>>();

export default {
  async get(cacheKey: string) {
    try {
      // We first check if we have a pending write for this cache key
      // If we do, we return the pending promise instead of fetching the cache
      const stored = pendingWritePromiseMap.get(cacheKey);
      if (stored) return stored;

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
        const hasBeenRevalidated = result.shouldBypassTagCache
          ? false
          : await globalThis.tagCache.hasBeenRevalidated(
              result.value.tags,
              result.lastModified,
            );
        if (hasBeenRevalidated) return undefined;
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
    const teedPromise = pendingEntry.then((entry) => {
      // Optimization: We avoid consuming and stringifying the stream here,
      // because it creates double copies just to be discarded when this function
      // ends. This avoids unnecessary memory usage, and reduces GC pressure.
      const [stream1, stream2] = entry.value.tee();
      return [
        { ...entry, value: stream1 },
        { ...entry, value: stream2 },
      ] as const;
    });

    pendingWritePromiseMap.set(
      cacheKey,
      teedPromise.then(([entry]) => entry),
    );

    const [, entryForStorage] = await teedPromise.finally(() => {
      pendingWritePromiseMap.delete(cacheKey);
    });

    await globalThis.incrementalCache.set(
      cacheKey,
      {
        ...entryForStorage,
        value: await fromReadableStream(entryForStorage.value),
      },
      "composable",
    );

    if (globalThis.tagCache.mode === "original") {
      const storedTags = await globalThis.tagCache.getByPath(cacheKey);
      const tagsToWrite = [];
      for (const tag of entryForStorage.tags) {
        if (!storedTags.includes(tag)) {
          tagsToWrite.push({ tag, path: cacheKey });
        }
      }
      if (tagsToWrite.length > 0) {
        await writeTags(tagsToWrite);
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

    const dedupeMap = new Map();
    for (const entry of pathsToUpdate.flat()) {
      dedupeMap.set(`${entry.path}|${entry.tag}`, entry);
    }
    await writeTags(Array.from(dedupeMap.values()));
  },

  // This one is necessary for older versions of next
  async receiveExpiredTags() {},
} satisfies ComposableCacheHandler;
