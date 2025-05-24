import {
  dynamicRouteMatcher,
  staticRouteMatcher,
} from "@opennextjs/aws/core/routing/routeMatcher.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  AppPathRoutesManifest: {
    "/api/app/route": "/api/app",
    "/app/page": "/app",
    "/catchAll/[...slug]/page": "/catchAll/[...slug]",
  },
  RoutesManifest: {
    version: 3,
    pages404: true,
    caseSensitive: false,
    basePath: "",
    locales: [],
    redirects: [],
    headers: [],
    routes: {
      dynamic: [
        {
          page: "/catchAll/[...slug]",
          regex: "^/catchAll/(.+?)(?:/)?$",
          routeKeys: {
            nxtPslug: "nxtPslug",
          },
          namedRegex: "^/catchAll/(?<nxtPslug>.+?)(?:/)?$",
        },
        {
          page: "/page/catchAll/[...slug]",
          regex: "^/page/catchAll/(.+?)(?:/)?$",
          routeKeys: {
            nxtPslug: "nxtPslug",
          },
          namedRegex: "^/page/catchAll/(?<nxtPslug>.+?)(?:/)?$",
        },
      ],
      static: [
        {
          page: "/app",
          regex: "^/app(?:/)?$",
          routeKeys: {},
          namedRegex: "^/app(?:/)?$",
        },
        {
          page: "/page",
          regex: "^/page(?:/)?$",
          routeKeys: {},
          namedRegex: "^/page(?:/)?$",
        },
        {
          page: "/page/catchAll/static",
          regex: "^/page/catchAll/static(?:/)?$",
          routeKeys: {},
          namedRegex: "^/page/catchAll/static(?:/)?$",
        },
      ],
    },
  },
  getStaticAPIRoutes: () => [
    {
      page: "/api/app",
      regex: "^/api/app(?:/)?$",
    },
  ],
}));

describe("routeMatcher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("staticRouteMatcher", () => {
    it("should match static app route", () => {
      const routes = staticRouteMatcher("/app");
      expect(routes).toEqual([
        {
          route: "/app",
          type: "app",
        },
      ]);
    });

    it("should match static api route", () => {
      const routes = staticRouteMatcher("/api/app");
      expect(routes).toEqual([
        {
          route: "/api/app",
          type: "route",
        },
      ]);
    });

    it("should not match app dynamic route", () => {
      const routes = staticRouteMatcher("/catchAll/slug");
      expect(routes).toEqual([]);
    });

    it("should not match page dynamic route", () => {
      const routes = staticRouteMatcher("/page/catchAll/slug");
      expect(routes).toEqual([]);
    });

    it("should not match random route", () => {
      const routes = staticRouteMatcher("/random");
      expect(routes).toEqual([]);
    });
  });

  describe("dynamicRouteMatcher", () => {
    it("should match dynamic app page", () => {
      const routes = dynamicRouteMatcher("/catchAll/slug/b");
      expect(routes).toEqual([
        {
          route: "/catchAll/[...slug]",
          type: "app",
        },
      ]);
    });

    it("should match dynamic page router page", () => {
      const routes = dynamicRouteMatcher("/page/catchAll/slug/b");
      expect(routes).toEqual([
        {
          route: "/page/catchAll/[...slug]",
          type: "page",
        },
      ]);
    });

    it("should match both the static and dynamic page", () => {
      const pathToMatch = "/page/catchAll/static";
      const dynamicRoutes = dynamicRouteMatcher(pathToMatch);
      expect(dynamicRoutes).toEqual([
        {
          route: "/page/catchAll/[...slug]",
          type: "page",
        },
      ]);

      const staticRoutes = staticRouteMatcher(pathToMatch);
      expect(staticRoutes).toEqual([
        {
          route: "/page/catchAll/static",
          type: "page",
        },
      ]);
    });
  });
});
