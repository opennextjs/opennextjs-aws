import { AppPathRoutesManifest, RoutesManifest } from "config/index";
import type { RouteDefinition } from "types/next-types";
import type { RouteType } from "types/open-next";

// Add the locale prefix to the regex so we correctly match the rawPath
const optionalLocalePrefixRegex = RoutesManifest.locales.length
  ? `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`
  : "^/";

// Add the basepath prefix to the regex so we correctly match the rawPath
const optionalBasepathPrefixRegex = RoutesManifest.basePath
  ? `^${RoutesManifest.basePath}/?`
  : "^/";

// Add the basePath prefix to the api routes
export const apiPrefix = RoutesManifest.basePath
  ? `${RoutesManifest.basePath}/api`
  : "/api";

function routeMatcher(routeDefinitions: RouteDefinition[]) {
  const regexp = routeDefinitions.map((route) => ({
    page: route.page,
    regexp: new RegExp(
      route.regex
        .replace("^/", optionalLocalePrefixRegex)
        .replace("^/", optionalBasepathPrefixRegex),
    ),
  }));

  // We need to use AppPathRoutesManifest here
  const appPathsSet = new Set(
    Object.entries(AppPathRoutesManifest)
      .filter(([key, _]) => key.endsWith("page"))
      .map(([_, value]) => value),
  );
  const routePathsSet = new Set(
    Object.entries(AppPathRoutesManifest)
      .filter(([key, _]) => key.endsWith("route"))
      .map(([_, value]) => value),
  );
  return function matchRoute(path: string) {
    const foundRoutes = regexp.filter((route) => route.regexp.test(path));

    if (foundRoutes.length > 0) {
      return foundRoutes.map((foundRoute) => {
        const routeType: RouteType | undefined = appPathsSet.has(
          foundRoute.page,
        )
          ? "app"
          : routePathsSet.has(foundRoute.page)
            ? "route"
            : "page";
        return {
          route: foundRoute.page,
          type: routeType,
        };
      });
    }
    return false;
  };
}

export const staticRouteMatcher = routeMatcher(RoutesManifest.routes.static);
export const dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);
