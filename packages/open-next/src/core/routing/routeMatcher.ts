import { AppPathRoutesManifest, RoutesManifest } from "config/index";
import type { RouteDefinition } from "types/next-types";
import type { ResolvedRoute, RouteType } from "types/open-next";

// Add the locale prefix to the regex so we correctly match the rawPath
const optionalLocalePrefixRegex = `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`;

// Add the basepath prefix to the regex so we correctly match the rawPath
const optionalBasepathPrefixRegex = RoutesManifest.basePath
  ? `^${RoutesManifest.basePath}/?`
  : "^/";

// Add the basePath prefix to the api routes
export const apiPrefix = `${RoutesManifest.basePath ?? ""}/api`;

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

export const staticRouteMatcher = routeMatcher(RoutesManifest.routes.static);
export const dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);
