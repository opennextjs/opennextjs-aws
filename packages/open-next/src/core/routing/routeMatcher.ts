import {
  AppPathRoutesManifest,
  PagesManifest,
  RoutesManifest,
} from "config/index";
import type { RouteDefinition } from "types/next-types";
import type { ResolvedRoute, RouteType } from "types/open-next";

// Add the locale prefix to the regex so we correctly match the rawPath
const optionalLocalePrefixRegex = `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`;

// Add the basepath prefix to the regex so we correctly match the rawPath
const optionalBasepathPrefixRegex = RoutesManifest.basePath
  ? `^${RoutesManifest.basePath}/?`
  : "^/";

const optionalPrefix = optionalLocalePrefixRegex.replace(
  "^/",
  optionalBasepathPrefixRegex,
);

function routeMatcher(routeDefinitions: RouteDefinition[]) {
  const regexp = routeDefinitions.map((route) => ({
    page: route.page,
    regexp: new RegExp(route.regex.replace("^/", optionalPrefix)),
  }));

  const appPathsSet = new Set();
  const routePathsSet = new Set();
  // We need to use AppPathRoutesManifest here
  for (const [k, v] of Object.entries(AppPathRoutesManifest)) {
    if (k.endsWith("page")) {
      appPathsSet.add(v);
    } else if (k.endsWith("route")) {
      routePathsSet.add(v);
    }
  }

  return function matchRoute(path: string): ResolvedRoute[] {
    const foundRoutes = regexp.filter((route) => route.regexp.test(path));

    return foundRoutes.map((foundRoute) => {
      let routeType: RouteType = "page";
      if (appPathsSet.has(foundRoute.page)) {
        routeType = "app";
      } else if (routePathsSet.has(foundRoute.page)) {
        routeType = "route";
      }
      return {
        route: foundRoute.page,
        type: routeType,
      };
    });
  };
}

export const staticRouteMatcher = routeMatcher([
  ...RoutesManifest.routes.static,
  ...getStaticAPIRoutes(),
]);
export const dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);

/**
 * Returns static API routes for both app and pages router cause Next will filter them out in staticRoutes in `routes-manifest.json`.
 * We also need to filter out page files that are under `app/api/*` as those would not be present in the routes manifest either.
 * This line from Next.js skips it:
 * https://github.com/vercel/next.js/blob/ded56f952154a40dcfe53bdb38c73174e9eca9e5/packages/next/src/build/index.ts#L1299
 *
 * Without it handleFallbackFalse will 404 on static API routes if there is a catch-all route on root level.
 */
function getStaticAPIRoutes(): RouteDefinition[] {
  const createRouteDefinition = (route: string) => ({
    page: route,
    regex: `^${route}(?:/)?$`,
  });
  const dynamicRoutePages = new Set(
    RoutesManifest.routes.dynamic.map(({ page }) => page),
  );
  const pagesStaticAPIRoutes = Object.keys(PagesManifest)
    .filter(
      (route) => route.startsWith("/api/") && !dynamicRoutePages.has(route),
    )
    .map(createRouteDefinition);

  // We filter out both static API and page routes from the app paths manifest
  const appPathsStaticAPIRoutes = Object.values(AppPathRoutesManifest)
    .filter(
      (route) =>
        (route.startsWith("/api/") || route === "/api") &&
        !dynamicRoutePages.has(route),
    )
    .map(createRouteDefinition);

  return [...pagesStaticAPIRoutes, ...appPathsStaticAPIRoutes];
}
