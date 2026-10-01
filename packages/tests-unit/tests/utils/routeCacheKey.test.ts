import { createHash } from "node:crypto";

import {
  type RouteCacheManifests,
  denormalizePagePath,
  getPathFromRouteCacheKey,
  getPrerenderRouteCacheKey,
  getRouteCacheKey,
  getRouteCacheOwner,
  normalizeAppPath,
  normalizeLocalePath,
  normalizePagePath,
  selectAppPageEntry,
  useRouteCacheKeys,
} from "@opennextjs/aws/utils/routeCacheKey.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("useRouteCacheKeys", () => {
  it("should only be enabled for next >= 16.3.8", () => {
    expect(useRouteCacheKeys("16.3.7")).toBe(false);
    expect(useRouteCacheKeys("16.3.8")).toBe(true);
    expect(useRouteCacheKeys("17.0.0")).toBe(true);
  });
});

describe("normalizePagePath / denormalizePagePath", () => {
  it.each([
    ["/", "/index"],
    ["/isr", "/isr"],
    ["/index/foo", "/index/index/foo"],
    ["/index/[slug]", "/index/[slug]"],
    ["/blog/[slug]", "/blog/[slug]"],
  ])("%s <=> %s", (page, normalized) => {
    expect(normalizePagePath(page)).toBe(normalized);
    expect(denormalizePagePath(normalized)).toBe(page);
  });
});

describe("normalizeAppPath", () => {
  it.each([
    ["/page", "/"],
    ["/(group)/isr/page", "/isr"],
    ["/@modal/blog/[slug]/page", "/blog/[slug]"],
    ["/api/data/route", "/api/data"],
    ["/page/page", "/page"],
  ])("%s => %s", (entry, route) => {
    expect(normalizeAppPath(entry)).toBe(route);
  });
});

describe("selectAppPageEntry", () => {
  it("should prefer the entry without parallel slot", () => {
    expect(
      selectAppPageEntry("/feed", [
        "/feed/@modal/page",
        "/(main)/feed/page",
        "/other/page",
      ]),
    ).toBe("/(main)/feed/page");
  });

  it("should return undefined when no entry renders the route", () => {
    expect(selectAppPageEntry("/missing", ["/page"])).toBeUndefined();
  });
});

describe("getRouteCacheOwner", () => {
  const manifests = {
    appPaths: ["/page", "/api/data/route", "/(group)/blog/[slug]/page"],
    pagesManifest: { "/_app": "pages/_app.js", "/isr": "pages/isr.js" },
  };

  it.each([
    ["/", { kind: "APP_PAGE", sourceRoute: "/page" }],
    ["/api/data", { kind: "APP_ROUTE", sourceRoute: "/api/data/route" }],
    [
      "/blog/[slug]",
      { kind: "APP_PAGE", sourceRoute: "/(group)/blog/[slug]/page" },
    ],
    ["/isr", { kind: "PAGES", sourceRoute: "/isr" }],
    ["/missing", undefined],
  ])("%s", (route, owner) => {
    expect(getRouteCacheOwner(route, manifests)).toEqual(owner);
  });
});

describe("getRouteCacheKey", () => {
  it("should scope the key by the source route", () => {
    expect(
      getRouteCacheKey("/blog/hello", {
        kind: "APP_PAGE",
        sourceRoute: "/blog/[slug]/page",
      }),
    ).toBe(`/route-cache/APP_PAGE/${sha256("/blog/[slug]/page")}/$/blog/hello`);
  });

  it("should normalize the index route", () => {
    expect(
      getRouteCacheKey("/", { kind: "APP_PAGE", sourceRoute: "/page" }),
    ).toBe(`/route-cache/APP_PAGE/${sha256("/page")}/$/index`);
  });
});

describe("getPathFromRouteCacheKey", () => {
  const hash = sha256("/page");

  it("should return the pathname of a route cache key", () => {
    expect(
      getPathFromRouteCacheKey(`/route-cache/APP_PAGE/${hash}/$/isr`),
    ).toBe("/isr");
    expect(getPathFromRouteCacheKey(`route-cache/PAGES/${hash}/$/en/isr`)).toBe(
      "/en/isr",
    );
  });

  it("should return other keys unchanged", () => {
    expect(getPathFromRouteCacheKey("/isr")).toBe("/isr");
    expect(getPathFromRouteCacheKey(hash)).toBe(hash);
  });
});

describe("normalizeLocalePath", () => {
  it.each([
    ["/en/isr", "/isr"],
    ["/EN/isr", "/isr"],
    ["/en", "/"],
    ["/isr", "/isr"],
  ])("%s => %s", (pathname, expected) => {
    expect(normalizeLocalePath(pathname, ["en", "fr"])).toBe(expected);
  });
});

describe("getPrerenderRouteCacheKey", () => {
  const manifests: RouteCacheManifests = {
    prerenderManifest: {
      routes: {
        "/": { initialRevalidateSeconds: false, srcRoute: "/" },
        "/blog/hello": {
          initialRevalidateSeconds: 60,
          srcRoute: "/blog/[slug]",
        },
        "/en/isr": { initialRevalidateSeconds: 60, srcRoute: null },
        "/en/posts/a": {
          initialRevalidateSeconds: 60,
          srcRoute: "/posts/[id]",
        },
      },
      dynamicRoutes: {
        "/blog/[slug]": {
          routeRegex: "^/blog/([^/]+?)(?:/)?$",
          fallback: "/blog/[slug].html",
          dataRouteRegex: "",
        },
      },
    },
    appPaths: ["/page", "/(group)/blog/[slug]/page"],
    pagesManifest: { "/isr": "pages/isr.js", "/posts/[id]": "pages/posts.js" },
    locales: ["en", "fr"],
  };

  it("should use the srcRoute of a prerendered route", () => {
    expect(getPrerenderRouteCacheKey("/blog/hello", manifests)).toBe(
      `/route-cache/APP_PAGE/${sha256("/(group)/blog/[slug]/page")}/$/blog/hello`,
    );
  });

  it("should handle the index route", () => {
    expect(getPrerenderRouteCacheKey("/", manifests)).toBe(
      `/route-cache/APP_PAGE/${sha256("/page")}/$/index`,
    );
  });

  it("should strip the locale from the source of a static pages route", () => {
    expect(getPrerenderRouteCacheKey("/en/isr", manifests)).toBe(
      `/route-cache/PAGES/${sha256("/isr")}/$/en/isr`,
    );
  });

  it("should handle a localized dynamic pages route", () => {
    expect(getPrerenderRouteCacheKey("/en/posts/a", manifests)).toBe(
      `/route-cache/PAGES/${sha256("/posts/[id]")}/$/en/posts/a`,
    );
  });

  it("should handle fallback shells", () => {
    expect(getPrerenderRouteCacheKey("/blog/[slug]", manifests)).toBe(
      `/route-cache/APP_PAGE/${sha256("/(group)/blog/[slug]/page")}/$/blog/[slug]`,
    );
  });

  it("should return undefined for paths outside of the prerender manifest", () => {
    expect(getPrerenderRouteCacheKey("/404", manifests)).toBeUndefined();
  });
});
