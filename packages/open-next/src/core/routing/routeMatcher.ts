import {
  AppPathRoutesManifest,
  PagesManifest,
  RoutesManifest,
} from "config/index";
import type { RouteCacheOwner } from "types/cache";
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

type AppRouteSources = {
  pages: Map<string, string[]>;
  routes: Map<string, string[]>;
};

/**
 * Compares App Router source entries using Next.js's primary-entry ordering.
 *
 * Parallel slots sort before ordinary entries, then source entries use lexical
 * order. `selectAppPageEntry` keeps the greatest entry, which means an ordinary
 * `/page` wins over its parallel slots while route groups remain part of the
 * selected cache identity.
 *
 * @param a First App Router source entry.
 * @param b Second App Router source entry.
 * @returns A negative, zero, or positive ordering value.
 */
function compareAppPaths(a: string, b: string): number {
  const aHasSlot = a.includes("/@");
  const bHasSlot = b.includes("/@");
  if (aHasSlot && !bHasSlot) return -1;
  if (!aHasSlot && bHasSlot) return 1;
  return a.localeCompare(b);
}

/**
 * Selects the App Page source entry whose identity Next.js hashes.
 *
 * @param appPaths Full source entries mapped to one public pathname.
 * @returns The source entry selected by Next.js.
 * @throws When no source entry is available.
 */
function selectAppPageEntry(appPaths: string[]): string {
  const [first, ...rest] = appPaths;
  if (!first) {
    throw new Error("Cannot select an App Page cache owner without an entry");
  }
  return rest.reduce(
    (selected, candidate) =>
      compareAppPaths(selected, candidate) < 0 ? candidate : selected,
    first,
  );
}

/**
 * Groups full App Router source entries by their public route pathname.
 *
 * @returns App Page and App Route source entries keyed by public pathname.
 */
function collectAppRouteSources(): AppRouteSources {
  const sources: AppRouteSources = {
    pages: new Map(),
    routes: new Map(),
  };
  for (const [sourceRoute, publicRoute] of Object.entries(
    AppPathRoutesManifest,
  )) {
    const target = sourceRoute.endsWith("/page")
      ? sources.pages
      : sourceRoute.endsWith("/route")
        ? sources.routes
        : undefined;
    if (!target) continue;
    target.set(publicRoute, [...(target.get(publicRoute) ?? []), sourceRoute]);
  }
  return sources;
}

const appRouteSources = collectAppRouteSources();

/**
 * Determines the owner Next.js uses for a matched response-cache route.
 *
 * Interception routes are deliberately excluded. Their selected module can
 * depend on router state headers that the pathname matcher does not model, so
 * treating their pathname match as authoritative would not be conservative.
 *
 * @param route Public route pathname from the routes manifest.
 * @param routeType OpenNext route type.
 * @returns The exact response-cache owner, or undefined when it is ambiguous.
 */
function getRouteCacheOwner(
  route: string,
  routeType: RouteType,
): RouteCacheOwner | undefined {
  if (routeType === "app") {
    const entries = appRouteSources.pages.get(route);
    if (!entries?.length) return undefined;
    const sourceRoute = selectAppPageEntry(entries);
    if (
      sourceRoute.includes("/(.)") ||
      sourceRoute.includes("/(..)") ||
      sourceRoute.includes("/(...)")
    ) {
      return undefined;
    }
    return { kind: "APP_PAGE", sourceRoute };
  }
  if (routeType === "route") {
    const entries = appRouteSources.routes.get(route);
    // Multiple route handlers for one public pathname should be rejected by
    // Next's build, but falling through is safer than choosing one if present.
    if (entries?.length !== 1) return undefined;
    return { kind: "APP_ROUTE", sourceRoute: entries[0] };
  }

  const filename = PagesManifest[route];
  if (!filename || filename.startsWith("pages/api/")) return undefined;
  return { kind: "PAGES", sourceRoute: route };
}

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
      const cacheOwner = getRouteCacheOwner(foundRoute.page, routeType);
      return {
        route: foundRoute.page,
        type: routeType,
        ...(cacheOwner ? { cacheOwner } : {}),
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
