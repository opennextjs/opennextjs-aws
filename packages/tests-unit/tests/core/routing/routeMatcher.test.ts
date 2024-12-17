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
          page: "/api/app",
          regex: "^/api/app(?:/)?$",
          routeKeys: {},
          namedRegex: "^/api/app(?:/)?$",
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
}));

describe("routeMatcher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("staticRouteMatcher", () => {
    it("should match static app route", () => {
      const route = staticRouteMatcher("/app");
      expect(route).toEqual([
        {
          route: "/app",
          type: "app",
        },
      ]);
    });

    it("should match static api route", () => {
      const route = staticRouteMatcher("/api/app");
      expect(route).toEqual([
        {
          route: "/api/app",
          type: "route",
        },
      ]);
    });

    it("should not match app dynamic route", () => {
      const route = staticRouteMatcher("/catchAll/slug");
      expect(route).toEqual(false);
    });

    it("should not match page dynamic route", () => {
      const route = staticRouteMatcher("/page/catchAll/slug");
      expect(route).toEqual(false);
    });

    it("should not match random route", () => {
      const route = staticRouteMatcher("/random");
      expect(route).toEqual(false);
    });
  });

  describe("dynamicRouteMatcher", () => {
    it("should match dynamic app page", () => {
      const route = dynamicRouteMatcher("/catchAll/slug/b");
      expect(route).toEqual([
        {
          route: "/catchAll/[...slug]",
          type: "app",
        },
      ]);
    });

    it("should match dynamic page router page", () => {
      const route = dynamicRouteMatcher("/page/catchAll/slug/b");
      expect(route).toEqual([
        {
          route: "/page/catchAll/[...slug]",
          type: "page",
        },
      ]);
    });

    it("should match both the static and dynamic page", () => {
      const pathToMatch = "/page/catchAll/static";
      const dynamicRoutes = dynamicRouteMatcher(pathToMatch);
      const staticRoutes = staticRouteMatcher(pathToMatch);
      expect(dynamicRoutes).toEqual([
        {
          route: "/page/catchAll/[...slug]",
          type: "page",
        },
      ]);
      expect(staticRoutes).toEqual([
        {
          route: "/page/catchAll/static",
          type: "page",
        },
      ]);
    });
  });
});
