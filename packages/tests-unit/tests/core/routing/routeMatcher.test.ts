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
    "/(marketing)/grouped/page": "/grouped",
    "/parallel/@a/page": "/parallel",
    "/parallel/@b/page": "/parallel",
    "/parallel/page": "/parallel",
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
        {
          page: "/grouped",
          regex: "^/grouped(?:/)?$",
          routeKeys: {},
          namedRegex: "^/grouped(?:/)?$",
        },
        {
          page: "/parallel",
          regex: "^/parallel(?:/)?$",
          routeKeys: {},
          namedRegex: "^/parallel(?:/)?$",
        },
      ],
    },
  },
  PagesManifest: {
    "/_app": "pages/_app.js",
    "/_document": "pages/_document.js",
    "/api/hello": "pages/api/hello.js",
    "/page": "pages/page.js",
    "/page/catchAll/[...slug]": "pages/page/catchAll/[...slug].js",
    "/page/catchAll/static": "pages/page/catchAll/static.js",
    "/_error": "pages/_error.js",
    "/404": "pages/404.html",
  },
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
          cacheOwner: {
            kind: "APP_PAGE",
            sourceRoute: "/app/page",
          },
        },
      ]);
    });

    it("should match static api route", () => {
      const routes = staticRouteMatcher("/api/app");
      expect(routes).toEqual([
        {
          route: "/api/app",
          type: "route",
          cacheOwner: {
            kind: "APP_ROUTE",
            sourceRoute: "/api/app/route",
          },
        },
      ]);

      const helloRoute = staticRouteMatcher("/api/hello");
      expect(helloRoute).toEqual([
        {
          route: "/api/hello",
          type: "page",
        },
      ]);
    });

    it("should not match app dynamic route", () => {
      const routes = staticRouteMatcher("/catchAll/slug");
      expect(routes).toEqual([]);
    });

    it("should retain route groups in the app cache owner", () => {
      expect(staticRouteMatcher("/grouped")).toEqual([
        {
          route: "/grouped",
          type: "app",
          cacheOwner: {
            kind: "APP_PAGE",
            sourceRoute: "/(marketing)/grouped/page",
          },
        },
      ]);
    });

    it("should select the primary app entry instead of a parallel slot", () => {
      expect(staticRouteMatcher("/parallel")).toEqual([
        {
          route: "/parallel",
          type: "app",
          cacheOwner: {
            kind: "APP_PAGE",
            sourceRoute: "/parallel/page",
          },
        },
      ]);
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
          cacheOwner: {
            kind: "APP_PAGE",
            sourceRoute: "/catchAll/[...slug]/page",
          },
        },
      ]);
    });

    it("should match dynamic page router page", () => {
      const routes = dynamicRouteMatcher("/page/catchAll/slug/b");
      expect(routes).toEqual([
        {
          route: "/page/catchAll/[...slug]",
          type: "page",
          cacheOwner: {
            kind: "PAGES",
            sourceRoute: "/page/catchAll/[...slug]",
          },
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
          cacheOwner: {
            kind: "PAGES",
            sourceRoute: "/page/catchAll/[...slug]",
          },
        },
      ]);

      const staticRoutes = staticRouteMatcher(pathToMatch);
      expect(staticRoutes).toEqual([
        {
          route: "/page/catchAll/static",
          type: "page",
          cacheOwner: {
            kind: "PAGES",
            sourceRoute: "/page/catchAll/static",
          },
        },
      ]);
    });
  });
});
