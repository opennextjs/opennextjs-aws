import path from "node:path";

import {
  AppPathRoutesManifest,
  AppPathsManifest,
  NEXT_DIR,
  NextConfig,
  PagesManifest,
  RoutesManifest,
} from "config/index.js";

// Only the fields of the Next.js route definition read when rendering a `match`
interface RouteMatch {
  definition: {
    kind: "PAGES" | "PAGES_API" | "APP_PAGE" | "APP_ROUTE";
    pathname: string;
    page: string;
    filename: string;
    appPaths?: string[];
  };
  params?: Record<string, string | string[]>;
}

// `[slug]`, `[...slug]` or `[[...slug]]`, possibly after an interception marker like `(.)`
const DYNAMIC_SEGMENT_REGEX = /\[{1,2}(\.\.\.)?([^\]]+)\]{1,2}$/;

/**
 * Returns the request metadata selecting `route` for `pathname`.
 *
 * Next.js 16.4 removed the route matcher manager from the base server: it now only renders the
 * most specific route matching the pathname, and `invokeOutput` can skip that route but no
 * longer selects another one. The Next.js router server forwards the route to render as a
 * `match` request metadata instead, which is required to retry the next route after a
 * `NoFallbackError` (i.e. a `fallback: false` page which was not prerendered).
 *
 * Next.js mutates the metadata of the previous attempt, which then contains the `match` of the
 * route which threw the `NoFallbackError`. `match` is always returned (possibly `undefined`) so
 * that it overrides this stale match even when the route can't be matched.
 *
 * Older versions of Next.js ignore the `match` metadata and match routes from `invokeOutput`.
 */
export function getRouteMatchMetadata(
  route: string,
  pathname: string,
): { match: RouteMatch | undefined } {
  const definition = getRouteDefinition(route);
  const params = definition
    ? getRouteParams(route, normalizePathname(pathname))
    : null;
  return {
    match: definition && params !== null ? { definition, params } : undefined,
  };
}

function getRouteDefinition(
  route: string,
): RouteMatch["definition"] | undefined {
  const appPaths = Object.keys(AppPathRoutesManifest).filter(
    (appPath) => AppPathRoutesManifest[appPath] === route,
  );
  const appPages = appPaths.filter((appPath) => appPath.endsWith("/page"));
  if (appPages.length > 0) {
    return {
      kind: "APP_PAGE",
      pathname: route,
      page: appPages[0],
      filename: getFilename(AppPathsManifest[appPages[0]]),
      appPaths: appPages,
    };
  }
  const appRoute = appPaths.find((appPath) => appPath.endsWith("/route"));
  if (appRoute) {
    return {
      kind: "APP_ROUTE",
      pathname: route,
      page: appRoute,
      filename: getFilename(AppPathsManifest[appRoute]),
    };
  }
  if (PagesManifest[route]) {
    return {
      kind:
        route === "/api" || route.startsWith("/api/") ? "PAGES_API" : "PAGES",
      pathname: route,
      page: route,
      filename: getFilename(PagesManifest[route]),
    };
  }
  return undefined;
}

function getFilename(manifestPath: string | undefined) {
  return manifestPath ? path.join(NEXT_DIR, "server", manifestPath) : "";
}

/**
 * Strips the basePath, the locale and the trailing slash, which are not part of route patterns.
 */
function normalizePathname(pathname: string) {
  const basePath = NextConfig.basePath;
  let normalized = pathname;
  if (
    basePath &&
    (normalized === basePath || normalized.startsWith(`${basePath}/`))
  ) {
    normalized = normalized.slice(basePath.length) || "/";
  }
  const [, firstSegment] = normalized.split("/");
  const isLocale = NextConfig.i18n?.locales.some(
    (locale) => locale.toLowerCase() === firstSegment?.toLowerCase(),
  );
  if (isLocale) {
    normalized = normalized.slice(firstSegment.length + 1) || "/";
  }
  return normalized !== "/" && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

/**
 * Returns the params of `route` for `pathname`, or `null` if it doesn't match.
 * Static routes have `undefined` params.
 *
 * Throws on malformed percent-encoded params, like Next.js.
 */
function getRouteParams(route: string, pathname: string) {
  const dynamicRoute = RoutesManifest.routes.dynamic.find(
    ({ page }) => page === route,
  );
  if (!dynamicRoute) {
    return pathname === route ? undefined : null;
  }
  const result = new RegExp(dynamicRoute.regex).exec(pathname);
  if (!result) {
    return null;
  }
  // The regex has one capture group per dynamic segment, in order
  const params: Record<string, string | string[]> = {};
  let group = 1;
  for (const segment of route.split("/")) {
    const dynamicSegment = DYNAMIC_SEGMENT_REGEX.exec(segment);
    if (!dynamicSegment) {
      continue;
    }
    const [, isCatchAll, name] = dynamicSegment;
    const value = result[group++];
    if (value !== undefined) {
      params[name] = isCatchAll
        ? value.split("/").map(decodeURIComponent)
        : decodeURIComponent(value);
    }
  }
  return params;
}
