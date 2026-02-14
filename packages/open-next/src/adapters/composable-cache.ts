import type {
  ComposableCacheEntry,
  ComposableCacheHandler,
  StoredComposableCacheEntry,
} from "types/cache";
import { writeTags } from "utils/cache";
import { debug } from "./logger";

const pendingWritePromiseMap = new Map<
  string,
  Promise<StoredComposableCacheEntry>
>();

export default {
  async get(cacheKey: string) {
    try {
      // We first check if we have a pending write for this cache key
      // If we do, we return the pending promise instead of fetching the cache
      const stored = pendingWritePromiseMap.get(cacheKey);
      if (stored) {
        return stored.then((val) => ({
          ...val,
          value: val.value.stream(),
        }));
      }

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
        value: result.value.value.stream(),
      };
    } catch (e) {
      debug("Cannot read composable cache entry");
      return undefined;
    }
  },

  async set(cacheKey: string, pendingEntry: Promise<ComposableCacheEntry>) {
    // Convert ReadableStream to Blob first
    const blobPromise = pendingEntry.then(async (entry) => {
      const reader = entry.value.getReader();
      const chunks: Uint8Array[] = [];
      let result: ReadableStreamReadResult<Uint8Array>;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
      reader.releaseLock();
      return { ...entry, value: new Blob(chunks) };
    });

    // Store a stream from the blob in the pending map for concurrent get() calls
    pendingWritePromiseMap.set(cacheKey, blobPromise);

    const entryWithBlob = await blobPromise;

    await globalThis.incrementalCache.set(
      cacheKey,
      entryWithBlob,
      "composable",
    );

    // Delete from pending map only after the write is complete
    pendingWritePromiseMap.delete(cacheKey);

    if (globalThis.tagCache.mode === "original") {
      const storedTags = await globalThis.tagCache.getByPath(cacheKey);
      const tagsToWrite = [];
      for (const tag of entryWithBlob.tags) {
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

    const dedupeMap = new Map();
    for (const entry of pathsToUpdate.flat()) {
      dedupeMap.set(`${entry.path}|${entry.tag}`, entry);
    }
    await writeTags(Array.from(dedupeMap.values()));
  },

  // This one is necessary for older versions of next
  async receiveExpiredTags() {},
} satisfies ComposableCacheHandler;
