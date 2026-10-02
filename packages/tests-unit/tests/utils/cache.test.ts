/* eslint-disable sonarjs/no-duplicate-string */
import {
  INTERNAL_HEADER_CACHE_MISS,
  clearIncrementalCacheEntry,
  getIncrementalCacheEntry,
  getTagsFromValue,
  seedIncrementalCacheMissFromHeaders,
} from "@opennextjs/aws/utils/cache.js";
import { CACHE_TAGS_HEADER } from "@opennextjs/aws/utils/cacheHeaders.js";
import { RequestCache } from "@opennextjs/aws/utils/requestCache.js";
import { vi } from "vitest";

declare global {
  var openNextConfig: {
    dangerous?: {
      disableIncrementalCache?: boolean;
      disableTagCache?: boolean;
    };
    middleware?: { external?: boolean };
  };
}

const incrementalCache = {
  name: "mock",
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
globalThis.incrementalCache = incrementalCache;

const createStore = () => ({ requestCache: new RequestCache() });
let store = createStore();
globalThis.__openNextAls = { getStore: () => store };

const entry = { value: { type: "route", body: "{}" }, lastModified: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  store = createStore();
  globalThis.__openNextAls = { getStore: () => store };
  globalThis.openNextConfig = { dangerous: {}, middleware: {} };
});

describe("getIncrementalCacheEntry", () => {
  it("Should read the store once per key and reuse the value", async () => {
    incrementalCache.get.mockResolvedValueOnce(entry);

    const first = await getIncrementalCacheEntry("/page");
    const second = await getIncrementalCacheEntry("/page");

    expect(incrementalCache.get).toHaveBeenCalledTimes(1);
    expect(incrementalCache.get).toHaveBeenCalledWith("/page", "cache");
    expect(second).toEqual(first);
  });

  it("Should memoize a miss as null", async () => {
    incrementalCache.get.mockResolvedValueOnce(undefined);

    await expect(getIncrementalCacheEntry("/page")).resolves.toBeNull();
    await expect(getIncrementalCacheEntry("/page")).resolves.toBeNull();

    expect(incrementalCache.get).toHaveBeenCalledTimes(1);
  });

  it("Should not let one reader strip the tags for another reader", async () => {
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "<html></html>",
        meta: { headers: { [CACHE_TAGS_HEADER]: "tag-a" } },
      },
      lastModified: 1,
    });

    const first = await getIncrementalCacheEntry("/page");
    // what the interceptor and the adapter do with the entry they read
    expect(getTagsFromValue(first?.value)).toEqual(["tag-a"]);
    expect(first?.value?.meta?.headers?.[CACHE_TAGS_HEADER]).toBeUndefined();

    const second = await getIncrementalCacheEntry("/page");

    // the other reader must still see the tags, otherwise it cannot detect a revalidated entry
    expect(getTagsFromValue(second?.value)).toEqual(["tag-a"]);
    expect(incrementalCache.get).toHaveBeenCalledTimes(1);
  });

  it("Should read the store again once the memo is cleared", async () => {
    incrementalCache.get.mockResolvedValue(entry);

    await getIncrementalCacheEntry("/page");
    clearIncrementalCacheEntry("/page");
    await getIncrementalCacheEntry("/page");

    expect(incrementalCache.get).toHaveBeenCalledTimes(2);
  });

  it("Should not share the memo between requests", async () => {
    incrementalCache.get.mockResolvedValue(entry);

    await getIncrementalCacheEntry("/page");
    store = createStore();
    globalThis.__openNextAls = { getStore: () => store };
    await getIncrementalCacheEntry("/page");

    expect(incrementalCache.get).toHaveBeenCalledTimes(2);
  });

  it("Should not memoize a read that a write invalidated while it was in flight", async () => {
    let resolveRead!: (value: unknown) => void;
    incrementalCache.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    const read = getIncrementalCacheEntry("/page");
    // a write to the same key finishes while the read is still in flight
    clearIncrementalCacheEntry("/page");
    resolveRead(entry);

    await expect(read).resolves.toEqual(entry);

    // the value read before the write must not be memoized
    incrementalCache.get.mockResolvedValueOnce({ ...entry, lastModified: 2 });
    await expect(getIncrementalCacheEntry("/page")).resolves.toEqual({
      ...entry,
      lastModified: 2,
    });
    expect(incrementalCache.get).toHaveBeenCalledTimes(2);
  });

  it("Should not memoize a failed read", async () => {
    incrementalCache.get.mockRejectedValueOnce(new Error("Error"));

    await expect(getIncrementalCacheEntry("/page")).rejects.toThrow("Error");

    incrementalCache.get.mockResolvedValueOnce(entry);
    await expect(getIncrementalCacheEntry("/page")).resolves.toEqual(entry);
    expect(incrementalCache.get).toHaveBeenCalledTimes(2);
  });

  it("Should read the store when there is no request context", async () => {
    globalThis.__openNextAls = { getStore: () => undefined };
    incrementalCache.get.mockResolvedValue(entry);

    await getIncrementalCacheEntry("/page");
    await getIncrementalCacheEntry("/page");

    expect(incrementalCache.get).toHaveBeenCalledTimes(2);
  });
});

describe("seedIncrementalCacheMissFromHeaders", () => {
  it("Should seed the memo and remove the header for an external middleware", async () => {
    globalThis.openNextConfig.middleware = { external: true };
    const headers = {
      [INTERNAL_HEADER_CACHE_MISS]: encodeURIComponent("/blog/記事"),
    };

    seedIncrementalCacheMissFromHeaders(headers);

    expect(headers[INTERNAL_HEADER_CACHE_MISS]).toBeUndefined();
    // The seeded key is decoded, so the handler does not read the store for it
    await expect(getIncrementalCacheEntry("/blog/記事")).resolves.toBeNull();
    expect(incrementalCache.get).not.toHaveBeenCalled();
  });

  it("Should ignore the header without an external middleware", async () => {
    globalThis.openNextConfig.middleware = {};
    const headers = {
      [INTERNAL_HEADER_CACHE_MISS]: encodeURIComponent("/page"),
    };

    seedIncrementalCacheMissFromHeaders(headers);

    expect(headers[INTERNAL_HEADER_CACHE_MISS]).toEqual(
      encodeURIComponent("/page"),
    );
    incrementalCache.get.mockResolvedValueOnce(entry);
    await expect(getIncrementalCacheEntry("/page")).resolves.toEqual(entry);
  });

  it("Should ignore a malformed header value", async () => {
    globalThis.openNextConfig.middleware = { external: true };
    const headers = { [INTERNAL_HEADER_CACHE_MISS]: "%E0%A4%A" };

    expect(() => seedIncrementalCacheMissFromHeaders(headers)).not.toThrow();

    expect(headers[INTERNAL_HEADER_CACHE_MISS]).toBeUndefined();
    incrementalCache.get.mockResolvedValueOnce(entry);
    await expect(getIncrementalCacheEntry("/page")).resolves.toEqual(entry);
  });

  it("Should ignore a non string header value", async () => {
    globalThis.openNextConfig.middleware = { external: true };
    const headers = {
      [INTERNAL_HEADER_CACHE_MISS]: ["/page", "/other"],
    };

    seedIncrementalCacheMissFromHeaders(headers);

    incrementalCache.get.mockResolvedValueOnce(entry);
    await expect(getIncrementalCacheEntry("/page")).resolves.toEqual(entry);
  });
});
