import { createHash } from "node:crypto";

import { NextConfig, PrerenderManifest } from "config/index";
import type {
  InternalEvent,
  InternalResult,
  MiddlewareEvent,
} from "types/open-next";
import type { CacheValue } from "types/overrides";
import { emptyReadableStream, toReadableStream } from "utils/stream";

import { isBinaryContentType } from "utils/binary";
import { getTagsFromValue, hasBeenRevalidated, isStale } from "utils/cache";
import {
  NO_STORE_CACHE_CONTROL,
  fixCacheControlForError,
} from "utils/cacheControl";
import { debug } from "../../adapters/logger";
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

async function computeCacheControl(
  path: string,
  body: string,
  host: string,
  revalidate?: number | false,
  lastModified?: number,
  isStaleFromTagCache = false,
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
  const etag = hash(body);
  if (revalidate === 0) {
    // This one should never happen
    return {
      "cache-control": NO_STORE_CACHE_CONTROL,
      "x-opennext-cache": "ERROR",
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
      let url = NextConfig.trailingSlash ? `${path}/` : path;
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
        MessageDeduplicationId: hash(`${path}-${lastModified}-${etag}`),
        MessageGroupId: generateMessageGroupId(path),
      });
    }
    return {
      "cache-control": `s-maxage=${sMaxAge}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
      "x-opennext-cache": isStale ? "STALE" : "HIT",
      etag,
    };
  }
  return {
    "cache-control": `s-maxage=${CACHE_ONE_YEAR}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
    "x-opennext-cache": "HIT",
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
  const segmentHeader = `${event.headers[NEXT_SEGMENT_PREFETCH_HEADER]}`;
  const isSegmentResponse =
    Boolean(segmentHeader) &&
    segmentHeader in (cachedValue.segmentData || {}) &&
    !NextConfig.experimental?.prefetchInlining;

  if (isSegmentResponse) {
    return {
      body: cachedValue.segmentData![segmentHeader],
      additionalHeaders: {
        [NEXT_PRERENDER_HEADER]: "1",
        [NEXT_POSTPONED_HEADER]: "2",
      },
    };
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
  );
  // Sometimes other status codes can be cached, like 404. For these cases, we should return the correct status code
  // Also set the status code to the rewriteStatusCode if defined
  // This can happen in handleMiddleware in routingHandler.
  // `NextResponse.rewrite(url, { status: xxx})
  // The rewrite status code should take precedence over the cached one
  const statusCode = event.rewriteStatusCode ?? cachedValue.meta?.status ?? 200;
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
): Promise<InternalEvent | InternalResult> {
  if (
    Boolean(event.headers["next-action"]) ||
    Boolean(event.headers["x-prerender-revalidate"])
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
  let localizedPath = localizePath(event);
  // If using basePath we need to remove it from the path
  if (NextConfig.basePath) {
    localizedPath = localizedPath.replace(NextConfig.basePath, "");
  }
  // We also need to remove trailing slash
  localizedPath = localizedPath.replace(/\/$/, "");

  // Then we decode the path params
  try {
    localizedPath = decodePathParams(localizedPath) || "/";
  } catch {
    // Next.js rejects malformed path params. Do not let cache interception
    // partially decode the path and select a different route identity.
    return event;
  }

  // The route is keyed as `/` in the prerender manifest, but the generated
  // cache asset for the app index route is uploaded as `/index`.
  const cacheKey = localizedPath === "/" ? "/index" : localizedPath;

  debug("Checking cache for", localizedPath, PrerenderManifest);

  const isISR =
    Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath) ||
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
          );

          const isBinary = isBinaryContentType(
            String(cachedData.value.meta?.headers?.["content-type"]),
          );

          const statusCode =
            event.rewriteStatusCode ?? cachedData.value.meta?.status ?? 200;
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
