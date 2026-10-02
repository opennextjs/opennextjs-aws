/**
 * Builds and validates route-owner-scoped Next.js response-cache keys.
 *
 * Next.js introduced these keys in security releases 15.5.27 and 16.3.8 to
 * prevent different routes that resolve to the same pathname from sharing a
 * cached response. A key combines the route kind, a hash of the selected Pages
 * or App Router source module, and the concrete request pathname.
 *
 * This module detects versions that use the new format, reproduces the key,
 * and checks prerender and ISR manifests before cache interception. Ambiguous
 * owners, partial prerendering shells, and unsupported fallback modes do not
 * produce a key and are left for Next.js to handle.
 */

import { createHash } from "node:crypto";
import path from "node:path";

import { NextConfig, PrerenderManifest } from "config/index";
import type { RouteCacheOwner } from "types/cache";
import type { ResolvedRoute } from "types/open-next";

import { compareSemver } from "../../utils/semver";

/**
 * Checks whether Next.js scopes response cache keys to their source route.
 *
 * The security fix was backported to the maintained 15.x line and released
 * independently from the 16.x line, so a single minimum-version comparison
 * would either miss 15.5.27 or incorrectly include vulnerable 16.0-16.3.7.
 *
 * @param version Installed Next.js version.
 * @returns Whether response cache ownership is encoded in opaque cache keys.
 */
export function hasRouteScopedResponseCache(version: string): boolean {
  return (
    (compareSemver(version, ">=", "15.5.27") &&
      compareSemver(version, "<", "16.0.0")) ||
    compareSemver(version, ">=", "16.3.8")
  );
}

/**
 * Normalizes a concrete response pathname exactly as Next.js does for storage.
 *
 * Root and literal `/index` must not share an entry: root becomes `/index`,
 * while an actual `/index` request becomes `/index/index`. Dynamic-looking
 * literal paths are not prefixed, matching Next.js's `normalizePagePath`.
 *
 * @param pathname Decoded concrete response pathname.
 * @returns The pathname suffix used in a route-scoped cache key.
 * @throws When POSIX normalization would alter the pathname.
 */
function normalizeRouteCachePath(pathname: string): string {
  const isDynamicPath = /\/\[[^/]+\](?=\/|$)/.test(pathname);
  const normalized =
    /^\/index(\/|$)/.test(pathname) && !isDynamicPath
      ? `/index${pathname}`
      : pathname === "/"
        ? "/index"
        : pathname.startsWith("/")
          ? pathname
          : `/${pathname}`;

  if (path.posix.normalize(normalized) !== normalized) {
    throw new Error(`Route cache pathname is not normalized: ${pathname}`);
  }
  return normalized;
}

/**
 * Computes Next.js's opaque response-cache key for a selected route owner.
 *
 * The owner must be selected before decoding request parameters. Two routes can
 * legitimately produce the same decoded pathname suffix; the source hash is
 * what keeps those entries isolated.
 *
 * @param pathname Decoded concrete response pathname.
 * @param owner Exact route-module identity selected from Next.js manifests.
 * @returns The opaque key supplied to OpenNext's incremental cache.
 */
function getRouteScopedCacheKey(
  pathname: string,
  owner: RouteCacheOwner,
): string {
  const sourceHash = createHash("sha256")
    .update(owner.sourceRoute)
    .digest("hex");
  return `/route-cache/${owner.kind}/${sourceHash}/$${normalizeRouteCachePath(pathname)}`;
}

/**
 * Removes a locale prefix when validating a Pages Router prerender owner.
 *
 * @param pathname Localized concrete pathname from the prerender manifest.
 * @returns The pathname without a configured locale prefix.
 */
function removeLocalePrefix(pathname: string): string {
  const locales = NextConfig.i18n?.locales ?? [];
  const [firstSegment, ...remainingSegments] = pathname.slice(1).split("/");
  if (!locales.includes(firstSegment)) return pathname;
  return `/${remainingSegments.join("/")}` || "/";
}

/**
 * Checks whether a concrete prerender record belongs to the selected route.
 *
 * This prevents an encoded catch-all request from borrowing the canonical
 * route's prerender record after both spellings decode to the same pathname.
 *
 * @param pathname Decoded concrete pathname used to find the prerender record.
 * @param route Ordered route selected from the still-encoded request pathname.
 * @returns Whether the record is complete, incomplete, or belongs elsewhere.
 */
function getConcretePrerenderStatus(
  pathname: string,
  route: ResolvedRoute,
): "complete" | "incomplete" | "other" {
  const prerender = PrerenderManifest?.routes?.[pathname];
  const owner = route.cacheOwner;
  if (!prerender || !owner) return "other";

  const kind =
    prerender.dataRoute === null
      ? "APP_ROUTE"
      : prerender.dataRoute?.endsWith(".json")
        ? "PAGES"
        : prerender.dataRoute?.endsWith(".rsc")
          ? "APP_PAGE"
          : undefined;
  if (kind !== owner.kind) return "other";

  const sourceRoute =
    prerender.srcRoute ??
    (kind === "PAGES" ? removeLocalePrefix(pathname) : pathname);
  if (sourceRoute !== route.route) return "other";

  // An `initial` response is a resumable PPR shell, not a complete response.
  // Returning it directly would close the stream before Next can append the
  // dynamic content. Older manifests omit this field and remain supported.
  return prerender.experimentalPPR === true ||
    prerender.renderingMode === "PARTIALLY_STATIC" ||
    (prerender.response && prerender.response !== "complete")
    ? "incomplete"
    : "complete";
}

/**
 * Checks whether owner-aware interception can safely serve this ISR request.
 *
 * Exact prerenders are safe after validating their kind and source route.
 * Runtime-generated entries are intercepted only for blocking fallback routes,
 * whose cache pathname is the concrete request path. Static fallbacks and PPR
 * shells can use a different cache pathname and therefore remain pass-through.
 *
 * @param pathname Decoded concrete response pathname.
 * @param route First route selected from the encoded post-rewrite pathname.
 * @returns Whether the interceptor can perform an authoritative scoped lookup.
 */
function isRouteScopedISR(
  pathname: string,
  route: ResolvedRoute | undefined,
): boolean {
  if (!route?.cacheOwner) return false;
  const concreteStatus = getConcretePrerenderStatus(pathname, route);
  if (concreteStatus === "complete") return true;
  if (concreteStatus === "incomplete") return false;

  const dynamicRoute = PrerenderManifest?.dynamicRoutes?.[route.route];
  const routePathname =
    route.cacheOwner.kind === "PAGES" ? removeLocalePrefix(pathname) : pathname;
  if (
    !dynamicRoute ||
    !new RegExp(dynamicRoute.routeRegex).test(routePathname)
  ) {
    return false;
  }
  return (
    dynamicRoute.experimentalPPR !== true &&
    dynamicRoute.renderingMode !== "PARTIALLY_STATIC" &&
    dynamicRoute.fallback === null &&
    dynamicRoute.response !== "initial"
  );
}

/**
 * Resolves the authoritative owner-scoped key for an intercepted request.
 *
 * @param pathname Decoded concrete response pathname.
 * @param route First route selected from the encoded post-rewrite pathname.
 * @returns The opaque cache key, or undefined when interception is unsafe.
 */
export function resolveRouteScopedCacheKey(
  pathname: string,
  route: ResolvedRoute | undefined,
): string | undefined {
  if (!route?.cacheOwner || !isRouteScopedISR(pathname, route))
    return undefined;
  try {
    return getRouteScopedCacheKey(pathname, route.cacheOwner);
  } catch {
    return undefined;
  }
}
