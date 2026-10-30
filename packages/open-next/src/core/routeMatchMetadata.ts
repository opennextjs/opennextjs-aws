import path from "node:path";

import {
  AppPathRoutesManifest,
  AppPathsManifest,
  NEXT_DIR,
  NextConfig,
  PagesManifest,
  RoutesManifest,
} from "config/index.js";

import type { RouteMatch, RouteMatchDefinition } from "types/next-types";

import {
  normalizeLocalePath,
  selectAppPageEntry,
} from "../utils/routeCacheKey.js";

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
 * Only used for Next.js 16.4+. Older versions retain their matcher-based retry path,
 * including parameter-decoding error handling, without calling this helper.
 *
 * @param route The route pattern selected for the retry, i.e. `/blog/[slug]`
 * @param pathname The encoded internal pathname after routing, which may include the basePath, a locale prefix and
 *   a trailing slash
 * @return Metadata selecting the route, or `{ match: undefined }` when the route is unknown or doesn't match the
 *   pathname (Next.js then renders a 404)
 * @throws {URIError} If a captured parameter contains malformed percent encoding
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

/**
 * Resolves a route to its Next.js definition from the manifests.
 *
 * App pages take precedence over app route handlers, then pages (`/api` and `/api/*` are pages API routes).
 * For app pages, the canonical entry is selected like Next.js when a route has parallel slots or route groups.
 *
 * @param route The route pattern selected for the retry, i.e. `/blog/[slug]`
 * @return The route definition, or `undefined` when the route is in none of the manifests
 */
function getRouteDefinition(route: string): RouteMatchDefinition | undefined {
  const appPaths = Object.keys(AppPathRoutesManifest).filter(
    (appPath) => AppPathRoutesManifest[appPath] === route,
  );
  const appPages = appPaths.filter((appPath) => appPath.endsWith("/page"));
  // Select the same canonical entry as Next.js and the route cache owner.
  const appPage = selectAppPageEntry(route, appPages);
  if (appPage) {
    return {
      kind: "APP_PAGE",
      pathname: route,
      page: appPage,
      filename: getFilename(AppPathsManifest[appPage]),
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

/**
 * Resolves a manifest entry to the absolute path of the compiled server module.
 *
 * @param manifestPath The path relative to `.next/server`, as stored in the manifests
 * @return The absolute module path, or an empty string when the entry is missing
 */
function getFilename(manifestPath: string | undefined): string {
  return manifestPath ? path.join(NEXT_DIR, "server", manifestPath) : "";
}

/**
 * Normalizes a pathname so it can be matched against route patterns.
 *
 * Strips the basePath, then the locale (case-insensitive), then the trailing slash, which are not part of route
 * patterns. The pathname is not decoded: params are decoded after matching, like Next.js.
 *
 * @param pathname The internal pathname of the request
 * @return The pathname without basePath, locale prefix and trailing slash
 */
function normalizePathname(pathname: string): string {
  const basePath = NextConfig.basePath;
  let normalized = pathname;
  if (
    basePath &&
    (normalized === basePath || normalized.startsWith(`${basePath}/`))
  ) {
    normalized = normalized.slice(basePath.length) || "/";
  }
  normalized = normalizeLocalePath(normalized, NextConfig.i18n?.locales);
  return normalized !== "/" && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

/**
 * Extracts the decoded params of a route for a normalized pathname.
 *
 * Static routes have `undefined` params. Missing optional catch-all params are omitted.
 *
 * @param route The route pattern, i.e. `/blog/[slug]`
 * @param pathname The normalized pathname to match against the route
 * @return The params, `undefined` for a matching static route, or `null` when the route doesn't match
 * @throws {URIError} If a captured parameter contains malformed percent encoding, like Next.js
 */
function getRouteParams(
  route: string,
  pathname: string,
): Record<string, string | string[]> | undefined | null {
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
