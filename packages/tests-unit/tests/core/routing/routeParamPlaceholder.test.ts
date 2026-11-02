import { dynamicRouteMatcher } from "@opennextjs/aws/core/routing/routeMatcher.js";
import { hasRouteParamPlaceholder } from "@opennextjs/aws/core/routing/routeParamPlaceholder.js";
import { vi } from "vitest";

vi.mock(
  "@opennextjs/aws/core/routing/routeMatcher.js",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@opennextjs/aws/core/routing/routeMatcher.js")
      >();
    return { ...mod, dynamicRouteMatcher: vi.fn(mod.dynamicRouteMatcher) };
  },
);

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  AppPathRoutesManifest: {
    "/catalog/[group]/[category]/[item]/page":
      "/catalog/[group]/[category]/[item]",
    "/docs/[...slug]/page": "/docs/[...slug]",
    "/shop/[[...path]]/page": "/shop/[[...path]]",
    "/feed/(..)photo/[id]/page": "/feed/(..)photo/[id]",
    "/api/[slug]/route": "/api/[slug]",
  },
  PagesManifest: {},
  RoutesManifest: {
    basePath: "",
    locales: ["en", "fr"],
    routes: {
      static: [],
      dynamic: [
        {
          page: "/catalog/[group]/[category]/[item]",
          regex: "^/catalog/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$",
        },
        { page: "/docs/[...slug]", regex: "^/docs/(.+?)(?:/)?$" },
        { page: "/shop/[[...path]]", regex: "^/shop(?:/(.+?))?(?:/)?$" },
        {
          page: "/feed/(..)photo/[id]",
          regex: "^/feed/\\(\\.\\.\\)photo/([^/]+?)(?:/)?$",
        },
        { page: "/legacy/[slug]", regex: "^/legacy/([^/]+?)(?:/)?$" },
        { page: "/api/[slug]", regex: "^/api/([^/]+?)(?:/)?$" },
      ],
    },
  },
}));

describe("hasRouteParamPlaceholder", () => {
  beforeEach(() => {
    vi.mocked(dynamicRouteMatcher).mockClear();
  });

  it.each([
    "/catalog/new/alpha/a",
    "/docs/a/b",
    "/catalog/new/missing/%255Bitem%255D",
    "/catalog/new/missing/item%5D",
  ])(
    "does not match the dynamic routes without an opening bracket: %s",
    (pathname) => {
      expect(hasRouteParamPlaceholder(pathname)).toBe(false);
      expect(dynamicRouteMatcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/catalog/new/missing/[item]",
    "/catalog/new/missing/%5Bitem%5D",
    "/catalog/new/missing/%5bitem%5d",
  ])("matches the dynamic routes with an opening bracket: %s", (pathname) => {
    expect(hasRouteParamPlaceholder(pathname)).toBe(true);
    expect(dynamicRouteMatcher).toHaveBeenCalledOnce();
  });
  it.each([
    "/catalog/new/alpha/a",
    "/docs/a/b",
    "/shop",
    "/shop/a/b",
    "/feed/(..)photo/1",
  ])("does not match concrete values: %s", (pathname) => {
    expect(hasRouteParamPlaceholder(pathname)).toBe(false);
  });

  it.each([
    "/catalog/new/missing/%5Bitem%5D",
    "/catalog/new/missing/%5bitem%5d",
    "/catalog/new/missing/[item]",
    "/catalog/new/missing/%5Bitem]",
    "/catalog/new/missing/[item]/",
    "/catalog/new/%5Bcategory%5D/a",
    "/catalog/[group]/alpha/a",
    "/en/catalog/new/missing/%5Bitem%5D",
    "/catalog/new/%ZZ/%5Bitem%5D",
  ])("matches a single param placeholder: %s", (pathname) => {
    expect(hasRouteParamPlaceholder(pathname)).toBe(true);
  });

  it.each([
    "/docs/%5B...slug%5D",
    "/docs/a/[...slug]",
    "/docs/[...slug]/b",
    "/shop/%5B%5B...path%5D%5D",
    "/shop/a/[[...path]]",
  ])("matches a catch-all param placeholder: %s", (pathname) => {
    expect(hasRouteParamPlaceholder(pathname)).toBe(true);
  });

  it("matches a param placeholder after an interception marker", () => {
    expect(hasRouteParamPlaceholder("/feed/(..)photo/[id]")).toBe(true);
  });

  it.each([
    // Other kind of param
    "/catalog/new/missing/[...item]",
    "/docs/[slug]",
    "/shop/[...path]",
    // Not a param of the route
    "/catalog/new/missing/[foo]",
    // Partial, double encoded or malformed values
    "/catalog/new/missing/[item]x",
    "/catalog/new/missing/[item].rsc",
    "/catalog/new/missing/%255Bitem%255D",
    "/catalog/new/missing/%5Bitem%5D%",
    "/catalog/new/missing%2F%5Bitem%5D/a",
    // Not an App Router page
    "/legacy/[slug]",
    "/api/[slug]",
    // No matching route
    "/other/[item]",
  ])("does not match %s", (pathname) => {
    expect(hasRouteParamPlaceholder(pathname)).toBe(false);
  });
});
