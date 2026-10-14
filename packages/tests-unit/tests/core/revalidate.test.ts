import { AsyncLocalStorage } from "node:async_hooks";

import {
  createRevalidate,
  getRouteTemplates,
  isServedByCurrentFunction,
  resolveRoute,
  revalidateRemote,
} from "@opennextjs/aws/core/revalidate.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  AppPathRoutesManifest: {
    "/page": "/",
    "/app/page": "/app",
    "/(group)/grouped/page": "/grouped",
    "/api/app/route": "/api/app",
  },
  RoutesManifest: {
    basePath: "",
    locales: ["en", "fr"],
    routes: {
      static: [
        { page: "/", regex: "^/(?:/)?$" },
        { page: "/app", regex: "^/app(?:/)?$" },
        { page: "/grouped", regex: "^/grouped(?:/)?$" },
        { page: "/about", regex: "^/about(?:/)?$" },
        { page: "/revalidate/static", regex: "^/revalidate/static(?:/)?$" },
      ],
      dynamic: [
        { page: "/revalidate/[key]", regex: "^/revalidate/([^/]+?)(?:/)?$" },
        { page: "/blog/[...slug]", regex: "^/blog/(.+?)(?:/)?$" },
      ],
    },
  },
  PagesManifest: {},
}));

const REVALIDATE_HEADERS = { "x-prerender-revalidate": "preview-id" };

/**
 * Run `fn` in an OpenNext request context.
 *
 * @param store Values of the store
 * @param fn The function to run
 * @returns The result of `fn`
 */
function runInContext<T>(store: Record<string, unknown>, fn: () => T): T {
  return globalThis.__openNextAls.run(store as any, fn);
}

describe("revalidate", () => {
  beforeEach(() => {
    globalThis.__openNextAls = new AsyncLocalStorage();
    globalThis.openNextConfig = { functions: {} } as any;
    globalThis.fnName = undefined;
    globalThis.cdnInvalidationHandler = {
      name: "test",
      invalidatePaths: vi.fn(),
    } as any;
    globalThis.internalFetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveRoute", () => {
    it("should resolve static pages", () => {
      expect(resolveRoute("/about")).toEqual({ route: "/about", type: "page" });
      expect(resolveRoute("/")).toEqual({ route: "/", type: "app" });
    });

    it("should resolve dynamic pages", () => {
      expect(resolveRoute("/revalidate/1")).toEqual({
        route: "/revalidate/[key]",
        type: "page",
      });
      expect(resolveRoute("/blog/a/b")).toEqual({
        route: "/blog/[...slug]",
        type: "page",
      });
    });

    it("should prefer static routes over dynamic routes", () => {
      expect(resolveRoute("/revalidate/static")).toEqual({
        route: "/revalidate/static",
        type: "page",
      });
    });

    it("should ignore the locale, query and trailing slash", () => {
      expect(resolveRoute("/fr/about/?a=b")).toEqual({
        route: "/about",
        type: "page",
      });
    });

    it("should return undefined for unknown paths", () => {
      expect(resolveRoute("/unknown/path")).toBeUndefined();
    });
  });

  describe("getRouteTemplates", () => {
    it("should map pages", () => {
      expect(getRouteTemplates({ route: "/", type: "page" })).toEqual([
        "pages/index",
      ]);
      expect(
        getRouteTemplates({ route: "/revalidate/[key]", type: "page" }),
      ).toEqual(["pages/revalidate/[key]"]);
    });

    it("should map app pages, including route groups", () => {
      expect(getRouteTemplates({ route: "/", type: "app" })).toEqual([
        "app/page",
      ]);
      expect(getRouteTemplates({ route: "/grouped", type: "app" })).toEqual([
        "app/(group)/grouped/page",
      ]);
    });
  });

  describe("isServedByCurrentFunction", () => {
    const route = { route: "/revalidate/[key]", type: "page" } as const;

    it("should be local without split functions", () => {
      expect(isServedByCurrentFunction(route)).toBe(true);
    });

    it("should be local for unknown routes", () => {
      globalThis.openNextConfig = {
        functions: { api: { routes: ["pages/api/revalidate"] } },
      } as any;
      globalThis.fnName = "api";
      expect(isServedByCurrentFunction(undefined)).toBe(true);
    });

    it("should be local in the default function for routes not in split functions", () => {
      globalThis.openNextConfig = {
        functions: { api: { routes: ["pages/api/revalidate"] } },
      } as any;
      expect(isServedByCurrentFunction(route)).toBe(true);
    });

    it("should be remote in a split function for routes of the default function", () => {
      globalThis.openNextConfig = {
        functions: { api: { routes: ["pages/api/revalidate"] } },
      } as any;
      globalThis.fnName = "api";
      expect(isServedByCurrentFunction(route)).toBe(false);
    });

    it("should be remote in the default function for routes of a split function", () => {
      globalThis.openNextConfig = {
        functions: { pages: { routes: ["pages/revalidate/[key]"] } },
      } as any;
      expect(isServedByCurrentFunction(route)).toBe(false);
    });

    it("should be local in the split function serving the route", () => {
      globalThis.openNextConfig = {
        functions: {
          api: { routes: ["pages/api/revalidate"] },
          pages: { routes: ["pages/revalidate/[key]"] },
        },
      } as any;
      globalThis.fnName = "pages";
      expect(isServedByCurrentFunction(route)).toBe(true);
      globalThis.fnName = "api";
      expect(isServedByCurrentFunction(route)).toBe(false);
    });
  });

  describe("revalidateRemote", () => {
    it("should send a HEAD request with only the revalidate headers", async () => {
      vi.mocked(globalThis.internalFetch).mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "x-nextjs-cache": "REVALIDATED" },
        }),
      );

      await runInContext({ host: "example.com" }, () =>
        revalidateRemote({
          urlPath: "/revalidate/1",
          headers: { ...REVALIDATE_HEADERS, "x-custom": ["a", "b"] },
          opts: {},
        }),
      );

      expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(globalThis.internalFetch).mock.calls[0];
      expect(url).toBe("https://example.com/revalidate/1");
      expect(init?.method).toBe("HEAD");
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const headers = init?.headers as Headers;
      expect(Object.fromEntries(headers.entries())).toEqual({
        "x-prerender-revalidate": "preview-id",
        "x-custom": "a, b",
      });
    });

    it("should support `revalidateHeaders` (older Next versions)", async () => {
      vi.mocked(globalThis.internalFetch).mockResolvedValue(
        new Response(null, { status: 200 }),
      );

      await runInContext({ host: "example.com" }, () =>
        revalidateRemote({
          urlPath: "/revalidate/1",
          revalidateHeaders: REVALIDATE_HEADERS,
          opts: {},
        }),
      );

      const [, init] = vi.mocked(globalThis.internalFetch).mock.calls[0];
      expect((init?.headers as Headers).get("x-prerender-revalidate")).toBe(
        "preview-id",
      );
    });

    it("should throw on invalid responses", async () => {
      vi.mocked(globalThis.internalFetch).mockResolvedValue(
        new Response(null, { status: 307 }),
      );

      await expect(
        runInContext({ host: "example.com" }, () =>
          revalidateRemote({ urlPath: "/a", headers: {}, opts: {} }),
        ),
      ).rejects.toThrow("Invalid response 307");
    });

    it("should accept 404 with unstable_onlyGenerated", async () => {
      vi.mocked(globalThis.internalFetch).mockResolvedValue(
        new Response(null, { status: 404 }),
      );

      await expect(
        runInContext({ host: "example.com" }, () =>
          revalidateRemote({
            urlPath: "/a",
            headers: {},
            opts: { unstable_onlyGenerated: true },
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it("should throw when the host is unknown", async () => {
      await expect(
        runInContext({}, () =>
          revalidateRemote({ urlPath: "/a", headers: {}, opts: {} }),
        ),
      ).rejects.toThrow("unknown host");
      expect(globalThis.internalFetch).not.toHaveBeenCalled();
    });
  });

  describe("createRevalidate", () => {
    const args = {
      urlPath: "/revalidate/1",
      headers: REVALIDATE_HEADERS,
      opts: {},
    };

    it("should revalidate local pages in-process and invalidate the CDN", async () => {
      const inProcess = vi.fn().mockResolvedValue(undefined);

      await runInContext({ host: "example.com", lastModified: 1 }, () =>
        createRevalidate(inProcess)(args),
      );

      expect(inProcess).toHaveBeenCalledWith(args);
      expect(globalThis.internalFetch).not.toHaveBeenCalled();
      expect(
        globalThis.cdnInvalidationHandler.invalidatePaths,
      ).toHaveBeenCalledWith([
        {
          initialPath: "/revalidate/1",
          rawPath: "/revalidate/1",
          resolvedRoutes: [{ route: "/revalidate/[key]", type: "page" }],
        },
      ]);
    });

    it("should render in an isolated request context", async () => {
      const outerStore = {
        host: "example.com",
        lastModified: 1,
        requestId: "id",
        writtenTags: new Set(["tag"]),
      };
      let innerStore: any;
      const inProcess = vi.fn(async () => {
        innerStore = globalThis.__openNextAls.getStore();
        innerStore.lastModified = 2;
      });

      await runInContext(outerStore, () => createRevalidate(inProcess)(args));

      expect(innerStore).not.toBe(outerStore);
      expect(innerStore.requestId).toBe("id");
      expect(innerStore.writtenTags.size).toBe(0);
      expect(outerStore.lastModified).toBe(1);
    });

    it("should not invalidate the CDN when the revalidation fails", async () => {
      const inProcess = vi
        .fn()
        .mockRejectedValue(new Error("Invalid response 500"));

      await expect(
        runInContext({}, () => createRevalidate(inProcess)(args)),
      ).rejects.toThrow("Invalid response 500");
      expect(
        globalThis.cdnInvalidationHandler.invalidatePaths,
      ).not.toHaveBeenCalled();
    });

    it("should not throw when the CDN invalidation fails", async () => {
      const inProcess = vi.fn().mockResolvedValue(undefined);
      vi.mocked(
        globalThis.cdnInvalidationHandler.invalidatePaths,
      ).mockRejectedValue(new Error("CDN error"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        runInContext({}, () => createRevalidate(inProcess)(args)),
      ).resolves.toBeUndefined();
    });

    it("should revalidate pages served by another function over the network", async () => {
      globalThis.openNextConfig = {
        functions: { api: { routes: ["pages/api/revalidate"] } },
      } as any;
      globalThis.fnName = "api";
      const inProcess = vi.fn();
      vi.mocked(globalThis.internalFetch).mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "x-nextjs-cache": "REVALIDATED" },
        }),
      );

      await runInContext({ host: "example.com" }, () =>
        createRevalidate(inProcess)(args),
      );

      expect(inProcess).not.toHaveBeenCalled();
      expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);
      // The function serving the page invalidates the CDN
      expect(
        globalThis.cdnInvalidationHandler.invalidatePaths,
      ).not.toHaveBeenCalled();
    });
  });
});
