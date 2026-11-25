import { createHash } from "node:crypto";

import { cacheInterceptor } from "@opennextjs/aws/core/routing/cacheInterceptor.js";
import { vi } from "vitest";

// The i18n module is not mocked: the cache keys are computed from the paths it localizes.
vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {
    basePath: "/docs",
    i18n: { defaultLocale: "en", locales: ["en", "fr"] },
  },
  AppPathRoutesManifest: {},
  AppPathsManifest: {},
  RoutesManifest: {
    basePath: "/docs",
    locales: ["en", "fr"],
    routes: { static: [], dynamic: [] },
  },
  PagesManifest: {
    "/": "pages/index.js",
    "/page": "pages/page.js",
  },
  PrerenderManifest: {
    routes: {
      "/en": { initialRevalidateSeconds: 60, srcRoute: null },
      "/en/page": { initialRevalidateSeconds: 60, srcRoute: null },
      "/fr/page": { initialRevalidateSeconds: 60, srcRoute: null },
    },
    dynamicRoutes: {},
  },
}));

const routeCacheKey = (page: string, pathname: string) =>
  `/route-cache/PAGES/${createHash("sha256").update(page).digest("hex")}/$${pathname}`;

afterEach(() => vi.unstubAllGlobals());

describe.each([
  // This version uses the localized pathname as the key.
  ["16.0.0", (_page: string, pathname: string) => pathname],
  // This version scopes the key by the page.
  ["16.3.8", routeCacheKey],
])(
  "cacheInterceptor with basePath and i18n (next %s)",
  (nextVersion, getKey) => {
    it.each([
      ["/docs", "/", "/en"],
      ["/docs/page", "/page", "/en/page"],
      ["/docs/fr/page", "/page", "/fr/page"],
    ])(
      "should look up %s without the basePath",
      async (rawPath, page, pathname) => {
        vi.stubGlobal("nextVersion", nextVersion);
        const get = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("incrementalCache", { get });

        await cacheInterceptor({
          type: "core",
          rawPath,
          url: `https://example.com${rawPath}`,
          method: "GET",
          headers: {},
          cookies: {},
          query: {},
          remoteAddress: "::1",
          body: Buffer.alloc(0),
        });

        expect(get.mock.calls).toEqual([[getKey(page, pathname)]]);
      },
    );
  },
);
