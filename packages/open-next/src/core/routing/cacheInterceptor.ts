import { createHash } from "node:crypto";
import path from "node:path";

import { NextConfig, PrerenderManifest } from "config/index";
import type { RouteCacheOwner } from "types/cache";
import type {
  InternalEvent,
  InternalResult,
  MiddlewareEvent,
  ResolvedRoute,
} from "types/open-next";
import type { CacheValue } from "types/overrides";
import { emptyReadableStream, toReadableStream } from "utils/stream";

import { isBinaryContentType } from "utils/binary";
import { getTagsFromValue, hasBeenRevalidated, isStale } from "utils/cache";
import {
  CACHE_CONTROL_HEADER,
  NO_STORE_CACHE_CONTROL,
  OPEN_NEXT_CACHE_HEADER,
  PRERENDER_REVALIDATE_HEADER,
  fixCacheControlForError,
} from "utils/cacheHeaders";
import { debug } from "../../adapters/logger";
import { compareSemver } from "../../utils/semver";
import { localizePath } from "./i18n";
import { generateMessageGroupId } from "./queue";

const CACHE_ONE_YEAR = 60 * 60 * 24 * 365;
const CACHE_ONE_MONTH = 60 * 60 * 24 * 30;

/*
 * We use this header to prevent Firefox (and possibly some CDNs) from incorrectly reusing the RSC responses during caching.
 * This can especially happen when there's a redirect in the middleware as the `_rsc` query parameter is not visible there.
 * So it will get dropped during the redirect, which results in the RSC response being cached instead of the actual HTML on the path `/`.
 * This value can be found in the routes manifest, under `rsc.varyHeader`.
 * They recompute it here in Next:
 * https://github.com/vercel/next.js/blob/c5bf5bb4c8b01b1befbbfa7ad97a97476ee9d0d7/packages/next/src/server/base-server.ts#L2011
 * Also see this PR: https://github.com/vercel/next.js/pull/79426
 */
const VARY_HEADER =
  "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";
const NEXT_SEGMENT_PREFETCH_HEADER = "next-router-segment-prefetch";
const NEXT_PRERENDER_HEADER = "x-nextjs-prerender";
const NEXT_POSTPONED_HEADER = "x-nextjs-postponed";

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
function hasRouteScopedResponseCache(version: string): boolean {
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
 * Removes the configured base path before locale detection.
 *
 * `localizePath` examines the first pathname segment. Passing `/base/fr/page`
 * to it directly would inspect `base`, potentially prepend a second locale,
 * and produce a cache key that Next.js never uses.
 *
 * @param event Incoming request after middleware and rewrites.
 * @returns The event pathname with an anchored base path removed.
 */
function getPathWithoutBasePath(event: MiddlewareEvent): string {
  const basePath = NextConfig.basePath;
  if (!basePath) return event.rawPath;
  if (event.rawPath === basePath) return "/";
  return event.rawPath.startsWith(`${basePath}/`)
    ? event.rawPath.slice(basePath.length)
    : event.rawPath;
}

async function computeCacheControl(
  path: string,
  body: string,
  host: string,
  revalidate?: number | false,
  lastModified?: number,
  isStaleFromTagCache = false,
  revalidationPath = path,
  revalidationKey = path,
) {
  let finalRevalidate = CACHE_ONE_YEAR;

  const existingRoute = Object.entries(PrerenderManifest?.routes ?? {}).find(
    (p) => p[0] === path,
  )?.[1];
  if (revalidate === undefined && existingRoute) {
    finalRevalidate =
      existingRoute.initialRevalidateSeconds === false
        ? CACHE_ONE_YEAR
        : existingRoute.initialRevalidateSeconds;
    // eslint-disable-next-line sonarjs/elseif-without-else
  } else if (revalidate !== undefined) {
    finalRevalidate = revalidate === false ? CACHE_ONE_YEAR : revalidate;
  }
  // calculate age
  const age = Math.round((Date.now() - (lastModified ?? 0)) / 1000);
  const hash = (str: string) => createHash("md5").update(str).digest("hex");
  // RFC 9110 entity-tag is a quoted opaque-tag. CloudFront drops unquoted ETags
  // when serving compressed objects.
  const etag = `"${hash(body)}"`;
  if (revalidate === 0) {
    // This one should never happen
    return {
      [CACHE_CONTROL_HEADER]: NO_STORE_CACHE_CONTROL,
      [OPEN_NEXT_CACHE_HEADER]: "ERROR",
      etag,
    };
  }

  // SSG uses one year cache
  const isSSG = finalRevalidate === CACHE_ONE_YEAR;
  const remainingTtl = Math.max(finalRevalidate - age, 1);

  const isStaleFromTime = !isSSG && remainingTtl === 1;
  const isStale = isStaleFromTime || isStaleFromTagCache;

  if (!isSSG || isStaleFromTagCache) {
    const sMaxAge = isStaleFromTagCache ? 1 : remainingTtl;
    debug("sMaxAge", {
      finalRevalidate,
      age,
      lastModified,
      revalidate,
      isStaleFromTagCache,
    });
    if (isStale) {
      let url =
        NextConfig.trailingSlash && revalidationPath !== "/"
          ? `${revalidationPath}/`
          : revalidationPath;
      if (NextConfig.basePath) {
        url = `${NextConfig.basePath}${url}`;
      }
      await globalThis.queue.send({
        MessageBody: {
          host,
          url,
          eTag: etag,
          lastModified: lastModified ?? Date.now(),
        },
        // Scoped owners can share a decoded pathname. Include the opaque key
        // so their background refreshes cannot deduplicate each other.
        MessageDeduplicationId: hash(
          `${revalidationKey}-${lastModified}-${etag}`,
        ),
        MessageGroupId: generateMessageGroupId(revalidationKey),
      });
    }
    return {
      [CACHE_CONTROL_HEADER]: `s-maxage=${sMaxAge}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
      [OPEN_NEXT_CACHE_HEADER]: isStale ? "STALE" : "HIT",
      etag,
    };
  }
  return {
    [CACHE_CONTROL_HEADER]: `s-maxage=${CACHE_ONE_YEAR}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
    [OPEN_NEXT_CACHE_HEADER]: "HIT",
    etag,
  };
}

/**
 * Computes the body of an RSC response from a cached app router entry.
 *
 * @param event The incoming event, used to read the segment prefetch header
 * @param cachedValue The cache entry, must be of type `app`
 * @returns The body and the headers to add to the response, or `undefined` when
 * the entry can not serve the request - the caller should then fallback to the server.
 * @throws When `cachedValue` is not of type `app`
 */
function getBodyForAppRouter(
  event: MiddlewareEvent,
  cachedValue: CacheValue<"cache">,
): { body: string; additionalHeaders: Record<string, string> } | undefined {
  if (cachedValue.type !== "app") {
    throw new Error("getBodyForAppRouter called with non-app cache value");
  }
  const segmentHeader = event.headers[NEXT_SEGMENT_PREFETCH_HEADER];
  // A request from the client Segment Cache has to be answered with the segment it asked
  // for. The full page payload is not a different-but-valid answer: the router never
  // records the prefetch as satisfied and re-requests it forever.
  // This mirrors how Next serves a cached app page - see the `segmentPrefetchHeader`
  // branch of `packages/next/src/build/templates/app-page.ts`, which responds with the
  // matching segment or an empty 404, and never with the full page.
  //
  // `experimental.prefetchInlining` is deliberately not consulted. Next normalizes every
  // truthy value - including the 16.2+ default - into `{ maxSize, maxBundleSize }`, so it
  // must never be read as a flag. More importantly it has no say here: inlining only
  // changes *which* segments the build emits (an emitted segment then being a bundle that
  // already holds its inlined ancestors), and `segmentData` holds exactly the segments
  // that were emitted, which is exactly the set the router asks for.
  if (typeof segmentHeader === "string" && cachedValue.segmentData) {
    if (Object.hasOwn(cachedValue.segmentData, segmentHeader)) {
      return {
        body: cachedValue.segmentData[segmentHeader],
        additionalHeaders: {
          [NEXT_PRERENDER_HEADER]: "1",
          [NEXT_POSTPONED_HEADER]: "2",
        },
      };
    }
    // The entry holds segments, but not this one. Next answers with an empty 404 here -
    // let the server do that rather than serving a payload of a different shape.
    return undefined;
  }
  // `rsc` is absent when the build collected neither a `.rsc` nor a `.prefetch.rsc` file for
  // this entry - fallback shells, and postponed PPR routes on Next 16.2+, see `CachedFile`.
  // There is nothing valid to serve, and falling back to an empty payload would break the
  // router and let the CDN cache the empty response, so let the server generate it.
  if (cachedValue.rsc === undefined) {
    return undefined;
  }
  return { body: cachedValue.rsc, additionalHeaders: {} };
}

/**
 * Generates the response to serve for a cached `app` or `page` entry.
 *
 * @param event The incoming event
 * @param localizedPath The localized path, used to compute the cache control
 * @param cachedValue The cache entry, must be of type `app` or `page`
 * @param lastModified Time of the last update to the cache entry
 * @param isStaleFromTagCache Whether the tag cache reported the entry as stale
 * @returns The result to serve, or `undefined` when the entry can not serve the
 * request - the caller should then fallback to the server.
 * @throws When `cachedValue` is neither of type `app` nor `page`
 */
async function generateResult(
  event: MiddlewareEvent,
  localizedPath: string,
  cachedValue: CacheValue<"cache">,
  lastModified?: number,
  isStaleFromTagCache = false,
  cacheKey = localizedPath,
  revalidationPath = localizedPath,
): Promise<InternalResult | undefined> {
  debug("Returning result from experimental cache");
  let body: string | undefined;
  let type = "application/octet-stream";
  let isDataRequest = false;
  let additionalHeaders: Record<string, string> = {};
  if (cachedValue.type === "app") {
    isDataRequest = event.headers.rsc === "1";
    if (isDataRequest) {
      const appRouterResult = getBodyForAppRouter(event, cachedValue);
      body = appRouterResult?.body;
      additionalHeaders = appRouterResult?.additionalHeaders ?? {};
    } else {
      body = cachedValue.html;
    }
    type = isDataRequest ? "text/x-component" : "text/html; charset=utf-8";
  } else if (cachedValue.type === "page") {
    isDataRequest = Boolean(event.query.__nextDataReq);
    body = isDataRequest ? JSON.stringify(cachedValue.json) : cachedValue.html;
    type = isDataRequest ? "application/json" : "text/html; charset=utf-8";
  } else {
    throw new Error(
      "generateResult called with unsupported cache value type, only 'app' and 'page' are supported",
    );
  }
  // Next.js does not write every file for every route at build time, so the entry might
  // not hold the data needed to serve this particular request.
  if (body === undefined) {
    debug("Missing body in the cache entry, falling back to the server");
    return undefined;
  }
  const cacheControl = await computeCacheControl(
    localizedPath,
    body,
    event.headers.host,
    cachedValue.revalidate,
    lastModified,
    isStaleFromTagCache,
    revalidationPath,
    cacheKey,
  );
  const statusCode = computeStatusCode(
    event.rewriteStatusCode,
    cachedValue.meta?.status,
  );
  const headers: Record<string, string | string[]> = {
    ...cacheControl,
    "content-type": type,
    ...cachedValue.meta?.headers,
    vary: VARY_HEADER,
    ...additionalHeaders,
  };
  // Applied last so that it wins over both the computed cache control and the one
  // that could be stored in the entry's own headers. This is the same override the
  // server path applies in `OpenNextNodeResponse.fixHeadersForError`, which the
  // interceptor bypasses by returning a result directly.
  fixCacheControlForError(headers, statusCode);
  return {
    type: "core",
    statusCode,
    body: toReadableStream(body, false),
    isBase64Encoded: false,
    headers,
  };
}

/**
 * Computes the status code to return for a cache hit.
 *
 * Sometimes other status codes can be cached, like 404. For these cases, we should return the correct status code.
 * The rewrite status code can be set in handleMiddleware in routingHandler with
 * `NextResponse.rewrite(url, { status: xxx })`.
 *
 * A meaningful cached status code (i.e. anything but the implicit 200) wins over the rewrite
 * status code, otherwise a rewrite would turn a cached error page into a successful response.
 *
 * @param rewriteStatusCode The status code from the middleware rewrite, if any.
 * @param cachedStatusCode The status code stored in the cache entry meta, if any.
 * @returns The status code to return.
 */
function computeStatusCode(
  rewriteStatusCode: number | undefined,
  cachedStatusCode: number | undefined,
): number {
  if (cachedStatusCode !== undefined && cachedStatusCode !== 200) {
    return cachedStatusCode;
  }
  return rewriteStatusCode ?? cachedStatusCode ?? 200;
}

/**
 *
 * https://github.com/vercel/next.js/blob/34039551d2e5f611c0abde31a197d9985918adaf/packages/next/src/shared/lib/router/utils/escape-path-delimiters.ts#L2-L10
 */
function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean,
): string {
  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? "|%(2f|23|3f|5c)" : ""})`, "gi"),
    (char: string) => encodeURIComponent(char),
  );
}

/**
 *
 * SSG cache key needs to be decoded, but some characters needs to be properly escaped
 * https://github.com/vercel/next.js/blob/34039551d2e5f611c0abde31a197d9985918adaf/packages/next/src/server/lib/router-utils/decode-path-params.ts#L11-L26
 * Decoding must be atomic, as in Next.js. Partially decoding a malformed path
 * could select a different cache route than the one evaluated by middleware.
 */
function decodePathParams(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => escapePathDelimiters(decodeURIComponent(segment), true))
    .join("/");
}

export async function cacheInterceptor(
  event: MiddlewareEvent,
  resolvedRoutes: ResolvedRoute[] = [],
): Promise<InternalEvent | InternalResult> {
  // Response-cache entries represent GET output. Intercepting another method
  // could skip an App Route handler and its side effects. HEAD remains a
  // pass-through until the interceptor can guarantee a bodyless response.
  if (event.method.toUpperCase() !== "GET") return event;
  if (
    Boolean(event.headers["next-action"]) ||
    Boolean(event.headers[PRERENDER_REVALIDATE_HEADER])
  )
    return event;

  // Check for Next.js preview mode cookies
  const cookies = event.headers.cookie || "";
  const hasPreviewData =
    cookies.includes("__prerender_bypass") ||
    cookies.includes("__next_preview_data");

  if (hasPreviewData) {
    debug("Preview mode detected, passing through to handler");
    return event;
  }
  // We localize the path in case i18n is enabled
  const pathWithoutBasePath = getPathWithoutBasePath(event);
  let localizedPath = localizePath({
    ...event,
    rawPath: pathWithoutBasePath,
  });
  // We also need to remove trailing slash
  localizedPath = localizedPath.replace(/\/$/, "");

  // Preserve the encoded spelling for background revalidation. The decoded
  // path is the response-cache suffix, but requesting it could select a
  // different owner than the original encoded catch-all request.
  const revalidationPath = localizedPath || "/";

  // Then we decode the path params
  try {
    localizedPath = decodePathParams(localizedPath) || "/";
  } catch {
    // Next.js rejects malformed path params. Do not let cache interception
    // partially decode the path and select a different route identity.
    return event;
  }

  const routeScoped = hasRouteScopedResponseCache(globalThis.nextVersion);
  const selectedRoute = resolvedRoutes[0];
  let cacheKey: string;
  if (routeScoped) {
    if (!isRouteScopedISR(localizedPath, selectedRoute)) return event;
    try {
      cacheKey = getRouteScopedCacheKey(
        localizedPath,
        selectedRoute!.cacheOwner!,
      );
    } catch {
      return event;
    }
  } else {
    // Legacy Next.js uses pathname-only keys and stores root under `/index`.
    cacheKey = localizedPath === "/" ? "/index" : localizedPath;
  }

  debug("Checking cache for", localizedPath, PrerenderManifest);

  const isISR = routeScoped
    ? true
    : Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath) ||
      Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((dr) =>
        new RegExp(dr.routeRegex).test(localizedPath),
      );
  debug("isISR", isISR);
  if (isISR) {
    try {
      const cachedData = await globalThis.incrementalCache.get(cacheKey);
      debug("cached data in interceptor", cachedData);

      if (!cachedData?.value) {
        return event;
      }
      const tags = getTagsFromValue(cachedData.value);
      // We need to check the tag cache now
      if (
        cachedData.value?.type === "app" ||
        cachedData.value?.type === "route"
      ) {
        const _hasBeenRevalidated = cachedData.shouldBypassTagCache
          ? false
          : await hasBeenRevalidated(cacheKey, tags, cachedData);

        if (_hasBeenRevalidated) {
          return event;
        }
      }

      // Check if the cache entry is stale (valid but needs background revalidation)
      const _isStale = cachedData.shouldBypassTagCache
        ? false
        : await isStale(cacheKey, tags, cachedData.lastModified ?? Date.now());

      const host = event.headers.host;
      switch (cachedData?.value?.type) {
        case "app":
        case "page": {
          const result = await generateResult(
            event,
            localizedPath,
            cachedData.value,
            cachedData.lastModified,
            _isStale,
            cacheKey,
            revalidationPath,
          );
          // The cache entry can not serve this request, fallback to the server.
          return result ?? event;
        }
        case "redirect": {
          const cacheControl = await computeCacheControl(
            localizedPath,
            "",
            host,
            cachedData.value.revalidate,
            cachedData.lastModified,
            _isStale,
            revalidationPath,
            cacheKey,
          );
          return {
            type: "core",
            statusCode: cachedData.value.meta?.status ?? 307,
            body: emptyReadableStream(),
            headers: {
              ...((cachedData.value.meta?.headers as Record<string, string>) ??
                {}),
              ...cacheControl,
            },
            isBase64Encoded: false,
          };
        }
        case "route": {
          const cacheControl = await computeCacheControl(
            localizedPath,
            cachedData.value.body,
            host,
            cachedData.value.revalidate,
            cachedData.lastModified,
            _isStale,
            revalidationPath,
            cacheKey,
          );

          const isBinary = isBinaryContentType(
            String(cachedData.value.meta?.headers?.["content-type"]),
          );

          const statusCode = computeStatusCode(
            event.rewriteStatusCode,
            cachedData.value.meta?.status,
          );
          const headers: Record<string, string | string[]> = {
            ...cacheControl,
            ...cachedData.value.meta?.headers,
            vary: VARY_HEADER,
          };
          // See the note in `generateResult`.
          fixCacheControlForError(headers, statusCode);
          return {
            type: "core",
            statusCode,
            body: toReadableStream(cachedData.value.body, isBinary),
            headers,
            isBase64Encoded: isBinary,
          };
        }
        default:
          return event;
      }
    } catch (e) {
      debug("Error while fetching cache", e);
      // In case of error we fallback to the server
      return event;
    }
  }
  return event;
}
