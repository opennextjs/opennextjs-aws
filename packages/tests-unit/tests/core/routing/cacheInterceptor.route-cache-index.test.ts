import { createHash } from "node:crypto";

import { cacheInterceptor } from "@opennextjs/aws/core/routing/cacheInterceptor.js";
import type { MiddlewareEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

// A root catch-all makes every path ISR, so it gets its own config mock.
vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {
    i18n: { locales: ["en", "nl"], defaultLocale: "en" },
  },
  RoutesManifest: {
    basePath: "",
    locales: ["en", "nl"],
    routes: {
      static: [],
      dynamic: [
        { page: "/post/[id]", regex: "^/post/([^/]+?)(?:/)?$" },
        { page: "/[...slug]", regex: "^/(.+?)(?:/)?$" },
      ],
    },
  },
  AppPathRoutesManifest: {},
  AppPathsManifest: {},
  PagesManifest: {
    "/": "pages/index.js",
    "/post/[id]": "pages/post/[id].js",
    "/[...slug]": "pages/[...slug].js",
  },
  PrerenderManifest: {
    routes: {
      "/en": {
        initialRevalidateSeconds: 60,
        srcRoute: null,
        dataRoute: "/_next/data/abc/en.json",
      },
    },
    dynamicRoutes: {
      "/post/[id]": {
        routeRegex: "^/post/([^/]+?)(?:/)?$",
        fallback: null,
        dataRouteRegex: "",
      },
      "/[...slug]": {
        routeRegex: "^/(.+?)(?:/)?$",
        fallback: null,
        dataRouteRegex: "",
      },
    },
  },
}));

vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
  localizePath: (event: MiddlewareEvent) => event.rawPath,
}));

function createEvent(rawPath: string): MiddlewareEvent {
  return {
    type: "core",
    method: "GET",
    rawPath,
    url: `https://on/${rawPath}`,
    body: Buffer.from(""),
    headers: {},
    query: {},
    cookies: {},
    remoteAddress: "::1",
  };
}

const incrementalCache = {
  name: "mock",
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

globalThis.incrementalCache = incrementalCache;

const catchAllKey = (pathname: string) =>
  `/route-cache/PAGES/${createHash("sha256").update("/[...slug]").digest("hex")}/$${pathname}`;

describe("cacheInterceptor - dynamic route rendering /index (next >= 16.3.8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.nextVersion = "16.3.8";
    globalThis.openNextConfig = {
      dangerous: { disableTagCache: false, disableIncrementalCache: false },
    };
    incrementalCache.get.mockResolvedValueOnce({});
  });

  it("should use the key Next.js uses for `/` when a catch-all renders /index", async () => {
    await cacheInterceptor(createEvent("/index"));

    expect(incrementalCache.get).toHaveBeenCalledWith(catchAllKey("/index"));
  });

  it("should use the key Next.js uses for `/<locale>` when a catch-all renders /<locale>/index", async () => {
    await cacheInterceptor(createEvent("/nl/index"));

    expect(incrementalCache.get).toHaveBeenCalledWith(catchAllKey("/nl"));
  });

  it("should keep nested index segments", async () => {
    await cacheInterceptor(createEvent("/foo/index"));

    expect(incrementalCache.get).toHaveBeenCalledWith(
      catchAllKey("/foo/index"),
    );
  });

  it("should keep /index/<path> as is", async () => {
    await cacheInterceptor(createEvent("/index/foo"));

    expect(incrementalCache.get).toHaveBeenCalledWith(
      catchAllKey("/index/index/foo"),
    );
  });
});
