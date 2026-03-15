/* eslint-disable sonarjs/no-duplicate-string */
import Cache, { SOFT_TAG_PREFIX } from "@opennextjs/aws/adapters/cache.js";
import { type Mock, vi } from "vitest";

declare global {
  var openNextConfig: {
    dangerous: { disableIncrementalCache?: boolean; disableTagCache?: boolean };
  };
  var isNextAfter15: boolean;
}

describe("CacheHandler", () => {
  let cache: Cache;

  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
  const getFetchCacheSpy = vi.spyOn(Cache.prototype, "getFetchCache");
  const getIncrementalCache = vi.spyOn(Cache.prototype, "getIncrementalCache");

  const incrementalCache = {
    name: "mock",
    get: vi.fn().mockResolvedValue({
      value: {
        type: "route",
        body: "{}",
      },
      lastModified: Date.now(),
    }),
    set: vi.fn(),
    delete: vi.fn(),
  };
  globalThis.incrementalCache = incrementalCache;

  const tagCache = {
    name: "mock",
    mode: "original",
    hasBeenRevalidated: vi.fn(),
    getByTag: vi.fn(),
    getByPath: vi.fn(),
    getLastModified: vi
      .fn()
      .mockResolvedValue(new Date("2024-01-02T00:00:00Z").getTime()),
    writeTags: vi.fn(),
    getPathsByTags: undefined as Mock | undefined,
  };
  globalThis.tagCache = tagCache;

  const invalidateCdnHandler = {
    name: "mock",
    invalidatePaths: vi.fn(),
  };
  globalThis.cdnInvalidationHandler = invalidateCdnHandler;

  globalThis.__openNextAls = {
    getStore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the getStore mock to return a fresh Set for each test
    (globalThis.__openNextAls.getStore as Mock).mockReturnValue({
      pendingPromiseRunner: {
        withResolvers: vi.fn().mockReturnValue({
          resolve: vi.fn(),
        }),
      },
      writtenTags: new Set(),
    });

    cache = new Cache();

    globalThis.openNextConfig = {
      dangerous: {
        disableIncrementalCache: false,
      },
    };
    globalThis.isNextAfter15 = false;
    tagCache.mode = "original";
    tagCache.getPathsByTags = undefined;
  });

  describe("get", () => {
    it("Should return null for cache miss", async () => {
      incrementalCache.get.mockResolvedValueOnce({});

      const result = await cache.get("key");

      expect(result).toBeNull();
    });

    describe("disableIncrementalCache", () => {
      beforeEach(() => {
        globalThis.openNextConfig.dangerous.disableIncrementalCache = true;
      });

      it("Should return null when incremental cache is disabled", async () => {
        const result = await cache.get("key");

        expect(result).toBeNull();
      });

      it("Should not set cache when incremental cache is disabled", async () => {
        globalThis.openNextConfig.dangerous.disableIncrementalCache = true;

        await cache.set("key", { kind: "REDIRECT", props: {} });

        expect(incrementalCache.set).not.toHaveBeenCalled();
      });

      it("Should not delete cache when incremental cache is disabled", async () => {
        globalThis.openNextConfig.dangerous.disableIncrementalCache = true;

        await cache.set("key", undefined);

        expect(incrementalCache.delete).not.toHaveBeenCalled();
      });
    });

    describe("fetch cache", () => {
      it("Should retrieve cache from fetch cache when fetch cache is true (next 13.5+)", async () => {
        await cache.get("key", { fetchCache: true });

        expect(getFetchCacheSpy).toHaveBeenCalled();
      });

      it("Should retrieve cache from fetch cache when hint is fetch (next14)", async () => {
        await cache.get("key", { kindHint: "fetch" });

        expect(getFetchCacheSpy).toHaveBeenCalled();
      });

      describe("next15", () => {
        beforeEach(() => {
          globalThis.isNextAfter15 = true;
        });

        it("Should retrieve cache from fetch cache when hint is fetch", async () => {
          await cache.get("key", { kind: "FETCH" });

          expect(getFetchCacheSpy).toHaveBeenCalled();
        });

        it("Should return null when tag cache last modified is -1", async () => {
          tagCache.getLastModified.mockResolvedValueOnce(-1);

          const result = await cache.get("key", { kind: "FETCH" });

          expect(getFetchCacheSpy).toHaveBeenCalled();
          expect(result).toBeNull();
        });

        it("Should return null with nextMode tag cache that has been revalidated", async () => {
          tagCache.mode = "nextMode";
          tagCache.hasBeenRevalidated.mockResolvedValueOnce(true);

          const result = await cache.get("key", {
            kind: "FETCH",
            tags: ["tag"],
          });
          expect(getFetchCacheSpy).toHaveBeenCalled();
          expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
          expect(result).toBeNull();
        });

        it("Should return null when incremental cache throws", async () => {
          incrementalCache.get.mockRejectedValueOnce(
            new Error("Error retrieving cache"),
          );

          const result = await cache.get("key", { kind: "FETCH" });

          expect(getFetchCacheSpy).toHaveBeenCalled();
          expect(result).toBeNull();
        });
      });
    });

    describe("incremental cache", () => {
      it.each(["app", "pages", undefined])(
        "Should retrieve cache from incremental cache when hint is not fetch: %s",
        async (kindHint) => {
          await cache.get("key", { kindHint: kindHint as any });

          expect(getIncrementalCache).toHaveBeenCalled();
        },
      );

      it("Should return null when tag cache last modified is -1", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
          },
          lastModified: Date.now(),
        });
        tagCache.getLastModified.mockResolvedValueOnce(-1);

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toBeNull();
      });

      it("Should return null with nextMode tag cache that has been revalidated", async () => {
        tagCache.mode = "nextMode";
        tagCache.hasBeenRevalidated.mockResolvedValueOnce(true);
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            meta: {
              headers: {
                "x-next-cache-tags": "tag",
              },
            },
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
        expect(result).toBeNull();
      });

      it("Should return value when cache data type is route", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "ROUTE",
            body: Buffer.from("{}"),
          },
          lastModified: Date.now(),
        });
      });

      it("Should return base64 encoded value when cache data type is route and content is binary", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: Buffer.from("hello").toString("base64"),
            meta: {
              headers: {
                "content-type": "image/png",
              },
            },
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "ROUTE",
            body: Buffer.from("hello"),
            headers: {
              "content-type": "image/png",
            },
          },
          lastModified: Date.now(),
        });
      });

      it("Should return value when cache data type is app", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "<html></html>",
            rsc: "rsc",
            meta: {
              status: 200,
            },
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "PAGE",
            html: "<html></html>",
            pageData: "rsc",
            status: 200,
          },
          lastModified: Date.now(),
        });
      });

      it("Should return value when cache data type is page", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "page",
            html: "<html></html>",
            json: {},
            meta: {
              status: 200,
            },
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "pages" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "PAGE",
            html: "<html></html>",
            pageData: {},
            status: 200,
          },
          lastModified: Date.now(),
        });
      });

      it("Should return value when cache data type is app with segmentData and postponed (Next 15+)", async () => {
        globalThis.isNextAfter15 = true;
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "<html></html>",
            rsc: "rsc-data",
            segmentData: {
              segment1: "data1",
              segment2: "data2",
            },
            meta: {
              status: 200,
              headers: { "x-custom": "value" },
              postponed: "postponed-data",
            },
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "APP_PAGE",
            html: "<html></html>",
            rscData: Buffer.from("rsc-data"),
            status: 200,
            headers: { "x-custom": "value" },
            postponed: "postponed-data",
            segmentData: new Map([
              ["segment1", Buffer.from("data1")],
              ["segment2", Buffer.from("data2")],
            ]),
          },
          lastModified: Date.now(),
        });
      });

      it("Should return value when cache data type is redirect", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "redirect",
          },
          lastModified: Date.now(),
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "REDIRECT",
          },
          lastModified: Date.now(),
        });
      });

      it("Should return null when incremental cache fails", async () => {
        incrementalCache.get.mockRejectedValueOnce(new Error("Error"));

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toBeNull();
      });
    });
  });

  describe("set", () => {
    it("Should delete cache when data is undefined", async () => {
      await cache.set("key", undefined);

      expect(incrementalCache.delete).toHaveBeenCalled();
    });

    it("Should set cache when for ROUTE", async () => {
      await cache.set("key", {
        kind: "ROUTE",
        body: Buffer.from("{}"),
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        { type: "route", body: "{}", meta: { status: 200, headers: {} } },
        "cache",
      );
    });

    it("Should set cache when for APP_ROUTE", async () => {
      await cache.set("key", {
        kind: "APP_ROUTE",
        body: Buffer.from("{}"),
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "route",
          body: Buffer.from("{}").toString("base64"),
          meta: { status: 200, headers: { "content-type": "image/png" } },
        },
        "cache",
      );
    });

    it("Should set cache when for PAGE", async () => {
      await cache.set("key", {
        kind: "PAGE",
        html: "<html></html>",
        pageData: {},
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "page",
          html: "<html></html>",
          json: {},
        },
        "cache",
      );
    });

    it("Should set cache when for PAGES", async () => {
      await cache.set("key", {
        kind: "PAGES",
        html: "<html></html>",
        pageData: "rsc",
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "app",
          html: "<html></html>",
          rsc: "rsc",
          meta: { status: 200, headers: {} },
        },
        "cache",
      );
    });

    it("Should set cache when for APP_PAGE", async () => {
      await cache.set("key", {
        kind: "APP_PAGE",
        html: "<html></html>",
        rscData: Buffer.from("rsc"),
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "app",
          html: "<html></html>",
          rsc: "rsc",
          meta: { status: 200, headers: {} },
        },
        "cache",
      );
    });

    it("Should set cache when for APP_PAGE with segmentData and postponed", async () => {
      const segmentData = new Map([
        ["segment1", Buffer.from("data1")],
        ["segment2", Buffer.from("data2")],
      ]);

      await cache.set("key", {
        kind: "APP_PAGE",
        html: "<html></html>",
        rscData: Buffer.from("rsc"),
        status: 200,
        headers: { "x-custom": "value" },
        segmentData,
        postponed: "postponed-data",
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "app",
          html: "<html></html>",
          rsc: "rsc",
          meta: {
            status: 200,
            headers: { "x-custom": "value" },
            postponed: "postponed-data",
          },
          segmentData: {
            segment1: "data1",
            segment2: "data2",
          },
        },
        "cache",
      );
    });

    it("Should set cache when for FETCH", async () => {
      await cache.set("key", {
        kind: "FETCH",
        data: {
          headers: {},
          body: "{}",
          url: "https://example.com",
          status: 200,
          tags: [],
        },
        revalidate: 60,
      });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          kind: "FETCH",
          data: {
            headers: {},
            body: "{}",
            url: "https://example.com",
            status: 200,
            tags: [],
          },
          revalidate: 60,
        },
        "fetch",
      );
    });

    it("Should set cache when for REDIRECT", async () => {
      await cache.set("key", { kind: "REDIRECT", props: {} });

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "key",
        {
          type: "redirect",
          props: {},
        },
        "cache",
      );
    });

    it("Should not set cache when for IMAGE (not implemented)", async () => {
      await cache.set("key", {
        kind: "IMAGE",
        etag: "etag",
        buffer: Buffer.from("hello"),
        extension: "png",
      });

      expect(incrementalCache.set).not.toHaveBeenCalled();
    });

    it("Should not throw when set cache throws", async () => {
      incrementalCache.set.mockRejectedValueOnce(new Error("Error"));

      await expect(
        cache.set("key", { kind: "REDIRECT", props: {} }),
      ).resolves.not.toThrow();
    });
  });

  describe("revalidateTag", () => {
    beforeEach(() => {
      globalThis.openNextConfig.dangerous.disableTagCache = false;
      globalThis.openNextConfig.dangerous.disableIncrementalCache = false;
    });
    it("Should do nothing if disableIncrementalCache is true", async () => {
      globalThis.openNextConfig.dangerous.disableIncrementalCache = true;

      await cache.revalidateTag("tag");

      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });

    it("Should do nothing if disableTagCache is true", async () => {
      globalThis.openNextConfig.dangerous.disableTagCache = true;

      await cache.revalidateTag("tag");

      expect(tagCache.writeTags).not.toHaveBeenCalled();
      // Reset the config
      globalThis.openNextConfig.dangerous.disableTagCache = false;
    });

    it("Should call tagCache.writeTags", async () => {
      tagCache.getByTag.mockResolvedValueOnce(["/path"]);
      await cache.revalidateTag("tag");

      expect(tagCache.getByTag).toHaveBeenCalledWith("tag");

      expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
      expect(tagCache.writeTags).toHaveBeenCalledWith([
        {
          path: "/path",
          tag: "tag",
          expiry: Date.now(),
        },
      ]);
    });

    it("Should call invalidateCdnHandler.invalidatePaths", async () => {
      tagCache.getByTag.mockResolvedValueOnce(["/path"]);
      tagCache.getByPath.mockResolvedValueOnce([]);
      await cache.revalidateTag(`${SOFT_TAG_PREFIX}path`);

      expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
      expect(tagCache.writeTags).toHaveBeenCalledWith([
        {
          path: "/path",
          tag: `${SOFT_TAG_PREFIX}path`,
          expiry: Date.now(),
        },
      ]);

      expect(invalidateCdnHandler.invalidatePaths).toHaveBeenCalled();
    });

    it("Should not call invalidateCdnHandler.invalidatePaths for fetch cache key ", async () => {
      tagCache.getByTag.mockResolvedValueOnce(["123456"]);
      await cache.revalidateTag("tag");

      expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
      expect(tagCache.writeTags).toHaveBeenCalledWith([
        {
          path: "123456",
          tag: "tag",
          expiry: Date.now(),
        },
      ]);

      expect(invalidateCdnHandler.invalidatePaths).not.toHaveBeenCalled();
    });

    it("Should only call writeTags for nextMode", async () => {
      tagCache.mode = "nextMode";
      await cache.revalidateTag(["tag1", "tag2"]);

      expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
      expect(tagCache.writeTags).toHaveBeenCalledWith([
        {
          tag: "tag1",
          expiry: Date.now(),
        },
        {
          tag: "tag2",
          expiry: Date.now(),
        },
      ]);
      expect(invalidateCdnHandler.invalidatePaths).not.toHaveBeenCalled();
    });

    it("Should not call writeTags when the tag list is empty for nextMode", async () => {
      tagCache.mode = "nextMode";
      await cache.revalidateTag([]);

      expect(tagCache.writeTags).not.toHaveBeenCalled();
      expect(invalidateCdnHandler.invalidatePaths).not.toHaveBeenCalled();
    });

    it("Should call writeTags and invalidateCdnHandler.invalidatePaths for nextMode that supports getPathsByTags", async () => {
      tagCache.mode = "nextMode";
      tagCache.getPathsByTags = vi.fn().mockResolvedValueOnce(["/path"]);
      await cache.revalidateTag("tag");

      expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
      expect(tagCache.writeTags).toHaveBeenCalledWith([
        {
          tag: "tag",
          expiry: Date.now(),
        },
      ]);
      expect(invalidateCdnHandler.invalidatePaths).toHaveBeenCalledWith([
        {
          initialPath: "/path",
          rawPath: "/path",
          resolvedRoutes: [
            {
              type: "app",
              route: "/path",
            },
          ],
        },
      ]);
    });

    describe("durations parameter", () => {
      it("Should set expiry immediately when no durations provided (default behavior) - original mode", async () => {
        // This is a duplicate test - see "Should call tagCache.writeTags" above
        // which already tests this behavior
      });

      it("Should set expiry immediately when no durations provided (default behavior) - nextMode", async () => {
        // This is a duplicate test - see "Should only call writeTags for nextMode" above
        // which already tests this behavior
      });

      it("Should set stale and expiry when durations.expire is provided - original mode", async () => {
        tagCache.getByTag.mockResolvedValueOnce(["/path"]);
        tagCache.getByPath.mockResolvedValueOnce([]);
        const now = Date.now();
        
        await cache.revalidateTag("tag", { expire: 60 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            path: "/path",
            tag: "tag",
            stale: now,
            expiry: now + 60 * 1000,
          },
        ]);
      });

      it("Should set stale and expiry when durations.expire is provided - nextMode", async () => {
        tagCache.mode = "nextMode";
        const now = Date.now();
        
        await cache.revalidateTag("tag", { expire: 60 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            tag: "tag",
            stale: now,
            expiry: now + 60 * 1000,
          },
        ]);
      });

      it("Should set stale without expiry when durations.expire is undefined", async () => {
        tagCache.mode = "nextMode";
        const now = Date.now();
        
        await cache.revalidateTag("tag", { expire: undefined });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            tag: "tag",
            stale: now,
            expiry: undefined,
          },
        ]);
      });

      it("Should handle multiple tags with durations - original mode", async () => {
        tagCache.getByTag
          .mockResolvedValueOnce(["/path1"])
          .mockResolvedValueOnce(["/path2"]);
        const now = Date.now();
        
        await cache.revalidateTag(["tag1", "tag2"], { expire: 30 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(2);
        expect(tagCache.writeTags).toHaveBeenNthCalledWith(1, [
          {
            path: "/path1",
            tag: "tag1",
            stale: now,
            expiry: now + 30 * 1000,
          },
        ]);
        expect(tagCache.writeTags).toHaveBeenNthCalledWith(2, [
          {
            path: "/path2",
            tag: "tag2",
            stale: now,
            expiry: now + 30 * 1000,
          },
        ]);
      });

      it("Should handle multiple tags with durations - nextMode", async () => {
        tagCache.mode = "nextMode";
        const now = Date.now();
        
        await cache.revalidateTag(["tag1", "tag2"], { expire: 30 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            tag: "tag1",
            stale: now,
            expiry: now + 30 * 1000,
          },
          {
            tag: "tag2",
            stale: now,
            expiry: now + 30 * 1000,
          },
        ]);
      });

      it("Should set expiry with durations for soft tags - original mode", async () => {
        // Test soft tag without hard tags (simpler case)
        tagCache.getByTag.mockResolvedValueOnce(["/path"]);
        tagCache.getByPath.mockResolvedValueOnce([]); // No hard tags
        const now = Date.now();
        
        await cache.revalidateTag(`${SOFT_TAG_PREFIX}path`, { expire: 60 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            path: "/path",
            tag: `${SOFT_TAG_PREFIX}path`,
            stale: now,
            expiry: now + 60 * 1000,
          },
        ]);
      });

      it("Should handle immediate expiration (expire: 0) - original mode", async () => {
        tagCache.getByTag.mockResolvedValueOnce(["/test-path"]);
        const now = Date.now();
        
        await cache.revalidateTag("testtag", { expire: 0 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            path: "/test-path",
            tag: "testtag",
            stale: now,
            expiry: now,
          },
        ]);
      });

      it("Should handle immediate expiration (expire: 0) - nextMode", async () => {
        tagCache.mode = "nextMode";
        const now = Date.now();
        
        await cache.revalidateTag("tag", { expire: 0 });

        expect(tagCache.writeTags).toHaveBeenCalledTimes(1);
        expect(tagCache.writeTags).toHaveBeenCalledWith([
          {
            tag: "tag",
            stale: now,
            expiry: now,
          },
        ]);
      });
    });
  });

  describe("shouldBypassTagCache", () => {
    describe("fetch cache", () => {
      it("Should bypass tag cache validation when shouldBypassTagCache is true", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            kind: "FETCH",
            data: {
              headers: {},
              body: "{}",
              url: "https://example.com",
              status: 200,
            },
          },
          lastModified: Date.now(),
          shouldBypassTagCache: true,
        });

        const result = await cache.get("key", {
          kind: "FETCH",
          tags: ["tag1"],
        });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(tagCache.getLastModified).not.toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result?.value).toEqual({
          kind: "FETCH",
          data: {
            headers: {},
            body: "{}",
            url: "https://example.com",
            status: 200,
          },
        });
      });

      it("Should not bypass tag cache validation when shouldBypassTagCache is false", async () => {
        tagCache.mode = "nextMode";
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            kind: "FETCH",
            data: {
              headers: {},
              body: "{}",
              url: "https://example.com",
              status: 200,
            },
          },
          lastModified: Date.now(),
          shouldBypassTagCache: false,
        });

        const result = await cache.get("key", {
          kind: "FETCH",
          tags: ["tag1"],
        });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });

      it("Should not bypass tag cache validation when shouldBypassTagCache is undefined", async () => {
        tagCache.mode = "nextMode";
        tagCache.hasBeenRevalidated.mockResolvedValueOnce(false);
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            kind: "FETCH",
            data: {
              headers: {},
              body: "{}",
              url: "https://example.com",
              status: 200,
            },
          },
          lastModified: Date.now(),
          // shouldBypassTagCache not set
        });

        const result = await cache.get("key", {
          kind: "FETCH",
          tags: ["tag1"],
        });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });

      it("Should bypass path validation when shouldBypassTagCache is true for soft tags", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            kind: "FETCH",
            data: {
              headers: {},
              body: "{}",
              url: "https://example.com",
              status: 200,
            },
          },
          lastModified: Date.now(),
          shouldBypassTagCache: true,
        });

        const result = await cache.get("key", {
          kind: "FETCH",
          softTags: [`${SOFT_TAG_PREFIX}path`],
        });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(tagCache.getLastModified).not.toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
      });
    });

    describe("incremental cache", () => {
      it("Should bypass tag cache validation when shouldBypassTagCache is true", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
          },
          lastModified: Date.now(),
          shouldBypassTagCache: true,
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(tagCache.getLastModified).not.toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result?.value?.kind).toEqual("ROUTE");
      });

      it("Should not bypass tag cache validation when shouldBypassTagCache is false", async () => {
        tagCache.mode = "nextMode";
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
            meta: { headers: { "x-next-cache-tags": "tag" } },
          },
          lastModified: Date.now(),
          shouldBypassTagCache: false,
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });

      it("Should return null when tag cache indicates revalidation and shouldBypassTagCache is false", async () => {
        tagCache.mode = "nextMode";
        tagCache.hasBeenRevalidated.mockResolvedValueOnce(true);
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
            meta: { headers: { "x-next-cache-tags": "tag" } },
          },
          lastModified: Date.now(),
          shouldBypassTagCache: false,
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).toHaveBeenCalled();
        expect(result).toBeNull();
      });

      it("Should return value when tag cache indicates revalidation but shouldBypassTagCache is true", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
          },
          lastModified: Date.now(),
          shouldBypassTagCache: true,
        });

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(tagCache.getLastModified).not.toHaveBeenCalled();
        expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result?.value?.kind).toEqual("ROUTE");
      });
    });
  });
});
