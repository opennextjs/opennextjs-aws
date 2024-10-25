/* eslint-disable sonarjs/no-duplicate-string */
import S3Cache, { hasCacheExtension } from "@opennextjs/aws/adapters/cache.js";
import { vi } from "vitest";

describe("hasCacheExtension", () => {
  it("Should returns true if has an extension and it is a CacheExtension", () => {
    expect(hasCacheExtension("hello.cache")).toBeTruthy();
  });

  it("Should returns false if has an extension and it is not a CacheExtension", () => {
    expect(hasCacheExtension("hello.json")).toBeFalsy();
  });

  it("Should return false if does not have any extension", () => {
    expect(hasCacheExtension("hello,json")).toBeFalsy();
  });
});

describe("S3Cache", () => {
  let cache: S3Cache;

  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
  const getFetchCacheSpy = vi.spyOn(S3Cache.prototype, "getFetchCache");
  const getIncrementalCache = vi.spyOn(
    S3Cache.prototype,
    "getIncrementalCache",
  );

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
    getByTag: vi.fn(),
    getByPath: vi.fn(),
    getLastModified: vi
      .fn()
      .mockResolvedValue(new Date("2024-01-02T00:00:00Z").getTime()),
    writeTags: vi.fn(),
  };
  globalThis.tagCache = tagCache;

  globalThis.__als = {
    getStore: vi.fn().mockReturnValue({
      requestId: "123",
      pendingPromiseRunner: {
        withResolvers: vi.fn().mockReturnValue({
          resolve: vi.fn(),
        }),
      },
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    cache = new S3Cache({
      _appDir: false,
      _requestHeaders: undefined as never,
    });

    globalThis.disableIncrementalCache = false;
    globalThis.isNextAfter15 = false;

    globalThis.lastModified = {};
  });

  describe("get", () => {
    it("Should return null when incremental cache is disabled", async () => {
      globalThis.disableIncrementalCache = true;

      const result = await cache.get("key");

      expect(result).toBeNull();
    });

    it("Should return null for cache miss", async () => {
      incrementalCache.get.mockResolvedValueOnce({});

      const result = await cache.get("key");

      expect(result).toBeNull();
    });

    describe("fetch cache", () => {
      it("Should retrieve cache from fetch cache when fetch cache is true", async () => {
        await cache.get("key", { fetchCache: true });

        expect(getFetchCacheSpy).toHaveBeenCalled();
      });

      it("Should retrieve cache from fetch cache when hint is fetch", async () => {
        await cache.get("key", { kindHint: "fetch" });

        expect(getFetchCacheSpy).toHaveBeenCalled();
      });

      it("Should return null when tag cache last modified is -1", async () => {
        tagCache.getLastModified.mockResolvedValueOnce(-1);

        const result = await cache.get("key", { kindHint: "fetch" });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(result).toBeNull();
      });

      it("Should return null when incremental cache throws", async () => {
        incrementalCache.get.mockRejectedValueOnce(
          new Error("Error retrieving cache"),
        );

        const result = await cache.get("key", { kindHint: "fetch" });

        expect(getFetchCacheSpy).toHaveBeenCalled();
        expect(result).toBeNull();
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

      it("Should return value when cache data type is route for next 15 and later", async () => {
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "route",
            body: "{}",
          },
          lastModified: Date.now(),
        });
        globalThis.isNextAfter15 = true;

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "APP_ROUTE",
            body: Buffer.from("{}"),
          },
          lastModified: Date.now(),
        });
      });

      it("Should return bas64 encoded value when cache data type is route and content is binary", async () => {
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

      it("Should return value when cache data type is app for next 15 and later", async () => {
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
        globalThis.isNextAfter15 = true;

        const result = await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "APP_PAGE",
            html: "<html></html>",
            rscData: Buffer.from("rsc"),
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

      it("Should return value when cache data type is page for next15 and later", async () => {
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
        globalThis.isNextAfter15 = true;

        const result = await cache.get("key", { kindHint: "pages" });

        expect(getIncrementalCache).toHaveBeenCalled();
        expect(result).toEqual({
          value: {
            kind: "PAGES",
            html: "<html></html>",
            pageData: {},
            status: 200,
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

        await cache.get("key", { kindHint: "app" });

        expect(getIncrementalCache).toHaveBeenCalled();
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
    it("Should not set cache when incremental cache is disabled", async () => {
      globalThis.disableIncrementalCache = true;

      await cache.set("key", { kind: "REDIRECT", props: {} });

      expect(incrementalCache.set).not.toHaveBeenCalled();
    });

    it("Should delete cache when data is undefined", async () => {
      await cache.set("key", undefined);

      expect(incrementalCache.delete).toHaveBeenCalled();
    });

    it("Should not delete cache when incremental cache is disabled", async () => {
      globalThis.disableIncrementalCache = true;

      await cache.set("key", undefined);

      expect(incrementalCache.delete).not.toHaveBeenCalled();
    });

    it("Should set cache when for ROUTE", async () => {
      await cache.set("key", {
        kind: "ROUTE",
        body: Buffer.from("{}"),
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalled();
    });

    it("Should set cache when for APP_ROUTE", async () => {
      await cache.set("key", {
        kind: "ROUTE",
        body: Buffer.from("{}"),
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });

      expect(incrementalCache.set).toHaveBeenCalled();
    });

    it("Should set cache when for PAGE", async () => {
      await cache.set("key", {
        kind: "PAGE",
        html: "<html></html>",
        pageData: {},
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalled();
    });

    it("Should set cache when for PAGES", async () => {
      await cache.set("key", {
        kind: "PAGE",
        html: "<html></html>",
        pageData: "rsc",
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalled();
    });

    it("Should set cache when for APP_PAGE", async () => {
      await cache.set("key", {
        kind: "APP_PAGE",
        html: "<html></html>",
        rscData: Buffer.from("rsc"),
        status: 200,
        headers: {},
      });

      expect(incrementalCache.set).toHaveBeenCalled();
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

      expect(incrementalCache.set).toHaveBeenCalled();
    });

    it("Should set cache when for REDIRECT", async () => {
      await cache.set("key", { kind: "REDIRECT", props: {} });

      expect(incrementalCache.set).toHaveBeenCalled();
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

      expect(
        async () => await cache.set("key", { kind: "REDIRECT", props: {} }),
      ).not.toThrow();
    });
  });
});
