import { getRouteMatchMetadata } from "@opennextjs/aws/core/routeMatchMetadata.js";
import { vi } from "vitest";

const { NextConfig } = vi.hoisted(() => ({
  NextConfig: {} as {
    basePath?: string;
    i18n?: { locales: string[]; defaultLocale: string };
  },
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NEXT_DIR: "/var/task/.next",
  NextConfig,
  AppPathRoutesManifest: {
    "/[slug]/page": "/[slug]",
    "/[...slug]/page": "/[...slug]",
    "/albums/(.)[album]/[song]/page": "/albums/(.)[album]/[song]",
    "/app-api/[id]/route": "/app-api/[id]",
  },
  AppPathsManifest: {
    "/[slug]/page": "app/[slug]/page.js",
    "/[...slug]/page": "app/[...slug]/page.js",
    "/albums/(.)[album]/[song]/page": "app/albums/(.)[album]/[song]/page.js",
    "/app-api/[id]/route": "app/app-api/[id]/route.js",
  },
  PagesManifest: {
    "/about": "pages/about.html",
    "/pages/[[...slug]]": "pages/pages/[[...slug]].js",
    "/api/[...path]": "pages/api/[...path].js",
  },
  RoutesManifest: {
    routes: {
      dynamic: [
        { page: "/[slug]", regex: "^/([^/]+?)(?:/)?$" },
        { page: "/[...slug]", regex: "^/(.+?)(?:/)?$" },
        {
          page: "/albums/(.)[album]/[song]",
          regex: "^/albums/\\(\\.\\)([^/]+?)/([^/]+?)(?:/)?$",
        },
        { page: "/app-api/[id]", regex: "^/app\\-api/([^/]+?)(?:/)?$" },
        { page: "/pages/[[...slug]]", regex: "^/pages(?:/(.+?))?(?:/)?$" },
        { page: "/api/[...path]", regex: "^/api/(.+?)(?:/)?$" },
      ],
    },
  },
}));

describe("getRouteMatchMetadata", () => {
  beforeEach(() => {
    NextConfig.basePath = undefined;
    NextConfig.i18n = undefined;
  });

  it("matches an app page", () => {
    expect(getRouteMatchMetadata("/[...slug]", "/foo/bar")).toStrictEqual({
      match: {
        definition: {
          kind: "APP_PAGE",
          pathname: "/[...slug]",
          page: "/[...slug]/page",
          filename: "/var/task/.next/server/app/[...slug]/page.js",
          appPaths: ["/[...slug]/page"],
        },
        params: { slug: ["foo", "bar"] },
      },
    });
  });

  it("matches an app route handler", () => {
    expect(getRouteMatchMetadata("/app-api/[id]", "/app-api/1")).toStrictEqual({
      match: {
        definition: {
          kind: "APP_ROUTE",
          pathname: "/app-api/[id]",
          page: "/app-api/[id]/route",
          filename: "/var/task/.next/server/app/app-api/[id]/route.js",
        },
        params: { id: "1" },
      },
    });
  });

  it("matches a pages API route", () => {
    expect(
      getRouteMatchMetadata("/api/[...path]", "/api/a/b").match,
    ).toStrictEqual({
      definition: {
        kind: "PAGES_API",
        pathname: "/api/[...path]",
        page: "/api/[...path]",
        filename: "/var/task/.next/server/pages/api/[...path].js",
      },
      params: { path: ["a", "b"] },
    });
  });

  it("matches a static page without params", () => {
    expect(getRouteMatchMetadata("/about", "/about").match).toMatchObject({
      definition: { kind: "PAGES", page: "/about" },
      params: undefined,
    });
  });

  it("omits a missing optional catch-all param", () => {
    expect(
      getRouteMatchMetadata("/pages/[[...slug]]", "/pages").match?.params,
    ).toStrictEqual({});
    expect(
      getRouteMatchMetadata("/pages/[[...slug]]", "/pages/a/b").match?.params,
    ).toStrictEqual({ slug: ["a", "b"] });
  });

  it("parses the params of intercepted routes", () => {
    expect(
      getRouteMatchMetadata("/albums/(.)[album]/[song]", "/albums/(.)a/b").match
        ?.params,
    ).toStrictEqual({ album: "a", song: "b" });
  });

  it("decodes the params", () => {
    expect(
      getRouteMatchMetadata("/[...slug]", "/a%20b/c%2Fd").match?.params,
    ).toStrictEqual({ slug: ["a b", "c/d"] });
  });

  it("throws on malformed percent-encoded params", () => {
    expect(() => getRouteMatchMetadata("/[slug]", "/%E0%A4%A")).toThrow(
      URIError,
    );
  });

  it("strips the trailing slash", () => {
    expect(getRouteMatchMetadata("/[slug]", "/foo/").match?.params).toEqual({
      slug: "foo",
    });
  });

  it("strips the basePath", () => {
    NextConfig.basePath = "/base";
    expect(getRouteMatchMetadata("/[slug]", "/base/foo").match?.params).toEqual(
      { slug: "foo" },
    );
    expect(
      getRouteMatchMetadata("/[...slug]", "/based/foo").match?.params,
    ).toEqual({ slug: ["based", "foo"] });
  });

  it("strips the locale", () => {
    NextConfig.i18n = { locales: ["en", "fr"], defaultLocale: "en" };
    expect(
      getRouteMatchMetadata("/pages/[[...slug]]", "/fr/pages/a").match?.params,
    ).toEqual({ slug: ["a"] });
    expect(
      getRouteMatchMetadata("/pages/[[...slug]]", "/pages/a").match?.params,
    ).toEqual({ slug: ["a"] });
  });

  it("clears the match when the route has no definition", () => {
    expect(getRouteMatchMetadata("/unknown/[id]", "/unknown/1")).toStrictEqual({
      match: undefined,
    });
  });

  it("clears the match when the route doesn't match the pathname", () => {
    expect(getRouteMatchMetadata("/[slug]", "/foo/bar")).toStrictEqual({
      match: undefined,
    });
    expect(getRouteMatchMetadata("/about", "/other")).toStrictEqual({
      match: undefined,
    });
  });
});
