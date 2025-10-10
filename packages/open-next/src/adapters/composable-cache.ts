import type { ComposableCacheEntry, ComposableCacheHandler } from "types/cache";
import { writeTags } from "utils/cache";
import { fromReadableStream, toReadableStream } from "utils/stream";
import { debug } from "./logger";

const pendingWritePromiseMap = new Map<string, Promise<ComposableCacheEntry>>();

export default {
  async get(cacheKey: string) {
    try {
      const stored = pendingWritePromiseMap.get(cacheKey);
      if (stored) return stored;

      const result = await globalThis.incrementalCache.get(
        cacheKey,
        "composable",
      );
      if (!result?.value?.value) return undefined;

      debug("composable cache result", result);

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

  async refreshTags() {},

  async getExpiration(...tags: string[]) {
    return globalThis.tagCache.mode === "nextMode"
      ? globalThis.tagCache.getLastRevalidated(tags)
      : 0;
  },

  async expireTags(...tags: string[]) {
    if (globalThis.tagCache.mode === "nextMode") {
      return writeTags(tags);
    }

    const tagCache = globalThis.tagCache;
    const revalidatedAt = Date.now();
    const pathsToUpdate = await Promise.all(
      tags.map(async (tag) => {
        const paths = await tagCache.getByTag(tag);
        return paths.map((path) => ({ path, tag, revalidatedAt }));
      }),
    );

    const dedupeMap = new Map();
    for (const entry of pathsToUpdate.flat()) {
      dedupeMap.set(`${entry.path}|${entry.tag}`, entry);
    }
    await writeTags(Array.from(dedupeMap.values()));
  },

  async receiveExpiredTags() {},
} satisfies ComposableCacheHandler;
