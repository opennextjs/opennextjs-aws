import { createHash } from "node:crypto";

import type { PrerenderManifest } from "../types/next-types.js";
import { compareSemver } from "./semver.js";

/**
 * Since Next.js 16.3.8, response cache keys (pages, app pages and app routes) are scoped
 * by the route owning the entry:
 * `/route-cache/<kind>/<sha256(sourceRoute)>/$<normalizedPathname>`.
 *
 * The helpers below mirror Next.js so that the build time cache population and the cache
 * interceptor compute the exact same key Next.js uses when reading and writing the cache.
 * https://github.com/vercel/next.js/blob/v16.3.8/packages/next/src/server/lib/route-cache-key.ts
 */

export type RouteCacheKind = "PAGES" | "APP_PAGE" | "APP_ROUTE";

export interface RouteCacheOwner {
  kind: RouteCacheKind;
  /**
   * The page pathname for the pages router (i.e. `/blog/[slug]`).
   * The app entry for the app router (i.e. `/(group)/blog/[slug]/page`).
   */
  sourceRoute: string;
}

export interface RouteCacheManifests {
  prerenderManifest: Pick<PrerenderManifest, "routes" | "dynamicRoutes">;
  /** The keys of the app paths manifest */
  appPaths: string[];
  pagesManifest: Record<string, string>;
  /** The i18n locales */
  locales?: string[];
}

const ROUTE_CACHE_DIRECTORY = "route-cache";

const ROUTE_CACHE_KEY_PREFIX =
  /^\/?route-cache\/(?:PAGES|APP_PAGE|APP_ROUTE)\/[0-9a-f]{64}\/\$(?=\/)/;

const DYNAMIC_ROUTE_REGEX = /\/\[[^/]+?\](?=\/|$)/;

/**
 * Whether the Next.js version uses scoped route cache keys.
 *
 * @param nextVersion The Next.js version
 */
export function useRouteCacheKeys(nextVersion: string): boolean {
  return compareSemver(nextVersion, ">=", "16.3.8");
}

/**
 * Mirrors `normalizePagePath` from Next.js.
 *
 * @example
 *     normalizePagePath("/") === "/index"
 *     normalizePagePath("/index/foo") === "/index/index/foo"
 */
export function normalizePagePath(page: string): string {
  if (/^\/index(\/|$)/.test(page) && !DYNAMIC_ROUTE_REGEX.test(page)) {
    return `/index${page}`;
  }
  if (page === "/") {
    return "/index";
  }
  return page.startsWith("/") ? page : `/${page}`;
}

/**
 * Mirrors `denormalizePagePath` from Next.js, the inverse of `normalizePagePath`.
 *
 * @example
 *     denormalizePagePath("/index") === "/"
 *     denormalizePagePath("/index/index/foo") === "/index/foo"
 */
export function denormalizePagePath(page: string): string {
  if (page.startsWith("/index/") && !DYNAMIC_ROUTE_REGEX.test(page)) {
    return page.slice(6);
  }
  return page === "/index" ? "/" : page;
}

/**
 * Mirrors `normalizeAppPath` from Next.js: removes groups, parallel slots and the leaf
 * `page`/`route` segment from an app entry.
 *
 * @example
 *     normalizeAppPath("/(group)/@modal/blog/[slug]/page") === "/blog/[slug]"
 */
export function normalizeAppPath(entry: string): string {
  const pathname = entry.split("/").reduce((acc, segment, index, segments) => {
    if (!segment) return acc;
    // Groups are ignored.
    if (segment.startsWith("(") && segment.endsWith(")")) return acc;
    // Parallel segments are ignored.
    if (segment.startsWith("@")) return acc;
    // The last segment (if it's a leaf) is ignored.
    if (
      (segment === "page" || segment === "route") &&
      index === segments.length - 1
    ) {
      return acc;
    }
    return `${acc}/${segment}`;
  }, "");
  return pathname === "" ? "/" : pathname;
}

function compareAppPaths(a: string, b: string): number {
  const aHasSlot = a.includes("/@");
  const bHasSlot = b.includes("/@");
  if (aHasSlot && !bHasSlot) return -1;
  if (!aHasSlot && bHasSlot) return 1;
  return a.localeCompare(b);
}

/**
 * Mirrors `selectAppPageEntry` from Next.js: selects the app entry rendering `route`,
 * a route can have multiple entries when it uses parallel routes.
 *
 * @param route The route, i.e. `/blog/[slug]`
 * @param appPaths The keys of the app paths manifest
 * @returns The app entry, or `undefined` when no entry renders the route
 */
export function selectAppPageEntry(
  route: string,
  appPaths: string[],
): string | undefined {
  let entry: string | undefined;
  for (const appPath of appPaths) {
    if (normalizeAppPath(appPath).replace(/%5F/g, "_") !== route) continue;
    if (entry === undefined || compareAppPaths(entry, appPath) < 0) {
      entry = appPath;
    }
  }
  return entry;
}

/**
 * Computes the owner of the cache entries for a route.
 *
 * @param sourceRoute The route owning the entry, i.e. `/blog/[slug]`
 * @param manifests.appPaths The keys of the app paths manifest
 * @param manifests.pagesManifest The pages manifest
 * @returns The owner, or `undefined` when the route is not handled by an app entry nor a page
 */
export function getRouteCacheOwner(
  sourceRoute: string,
  {
    appPaths,
    pagesManifest,
  }: { appPaths: string[]; pagesManifest: Record<string, string> },
): RouteCacheOwner | undefined {
  const appEntry = selectAppPageEntry(sourceRoute, appPaths);
  if (appEntry) {
    return {
      kind: appEntry.endsWith("/route") ? "APP_ROUTE" : "APP_PAGE",
      sourceRoute: appEntry,
    };
  }
  if (Object.hasOwn(pagesManifest, sourceRoute)) {
    return { kind: "PAGES", sourceRoute };
  }
  return undefined;
}

/**
 * Mirrors `normalizeLocalePath` from Next.js: removes the locale prefix from a pathname.
 *
 * @example
 *     normalizeLocalePath("/en/isr", ["en", "fr"]) === "/isr"
 *     normalizeLocalePath("/en", ["en", "fr"]) === "/"
 */
export function normalizeLocalePath(pathname: string, locales?: string[]) {
  const segment = pathname.split("/", 2)[1]?.toLowerCase();
  const locale = locales?.find((l) => l.toLowerCase() === segment);
  if (!locale) {
    return pathname;
  }
  return pathname.slice(locale.length + 1) || "/";
}

/**
 * Mirrors how Next.js resolves the cache pathname of a dynamic route: a route resolving to
 * `/index` (i.e. a root catch-all rendering `/index`) is cached as `/`, or as `/<locale>` with i18n.
 *
 * @example
 *     getDynamicRouteCachePathname("/index") === "/"
 *     getDynamicRouteCachePathname("/en/index", ["en", "fr"]) === "/en"
 *
 * @param pathname The localized pathname, i.e. `/en/blog/hello` with i18n
 * @param locales The i18n locales
 */
export function getDynamicRouteCachePathname(
  pathname: string,
  locales?: string[],
): string {
  if (normalizeLocalePath(pathname, locales) !== "/index") {
    return pathname;
  }
  return pathname.slice(0, -"/index".length) || "/";
}

/**
 * Computes the cache key of an entry from the prerender manifest, i.e. a prerendered
 * route (`routes`) or a fallback shell (`dynamicRoutes`).
 *
 * @param pathname The pathname of the entry, as keyed in the prerender manifest
 * @param manifests The manifests used to compute the owner
 * @returns The cache key, or `undefined` when the pathname is not in the prerender manifest
 * or when its owner could not be found.
 */
export function getPrerenderRouteCacheKey(
  pathname: string,
  manifests: RouteCacheManifests,
): string | undefined {
  const { routes, dynamicRoutes } = manifests.prerenderManifest;
  const prerender = Object.hasOwn(routes, pathname)
    ? routes[pathname]
    : undefined;
  const fallback =
    !prerender && Object.hasOwn(dynamicRoutes, pathname)
      ? dynamicRoutes[pathname]
      : undefined;
  if (!prerender && !fallback) {
    return undefined;
  }
  const sourceRoute = prerender
    ? prerender.srcRoute
    : (fallback?.fallbackSourceRoute ?? pathname);
  let owner: RouteCacheOwner | undefined;
  if (sourceRoute) {
    owner = getRouteCacheOwner(sourceRoute, manifests);
  } else {
    // Static routes have no `srcRoute`, the pathname is the route.
    // Pages routes are localized while the page itself is not.
    owner = getRouteCacheOwner(pathname, manifests);
    if (!owner && manifests.locales?.length) {
      const pagesOwner = getRouteCacheOwner(
        normalizeLocalePath(pathname, manifests.locales),
        manifests,
      );
      owner = pagesOwner?.kind === "PAGES" ? pagesOwner : undefined;
    }
  }
  return owner ? getRouteCacheKey(pathname, owner) : undefined;
}

/**
 * Mirrors `getRouteCacheKey` from Next.js.
 *
 * @param pathname The pathname of the entry, i.e. `/blog/hello` (`/en/blog/hello` with i18n)
 * @param owner The owner of the entry
 * @returns The cache key, i.e. `/route-cache/APP_PAGE/<sha256>/$/blog/hello`
 */
export function getRouteCacheKey(
  pathname: string,
  owner: RouteCacheOwner,
): string {
  const source = createHash("sha256").update(owner.sourceRoute).digest("hex");
  return `/${ROUTE_CACHE_DIRECTORY}/${owner.kind}/${source}/$${normalizePagePath(pathname)}`;
}

/**
 * Returns the normalized pathname of a route cache key, i.e. `/blog/hello` for
 * `/route-cache/APP_PAGE/<sha256>/$/blog/hello`.
 * Keys that are not route cache keys are returned unchanged.
 *
 * @param key The cache key, with or without the leading `/`
 */
export function getPathFromRouteCacheKey(key: string): string {
  return key.replace(ROUTE_CACHE_KEY_PREFIX, "");
}
