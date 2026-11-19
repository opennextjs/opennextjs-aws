import {
  BuildId,
  ConfigHeaders,
  NextConfig,
  PrerenderManifest,
  RoutesManifest,
} from "config/index";
import type {
  InternalEvent,
  InternalResult,
  ResolvedRoute,
  RoutingResult,
} from "types/open-next";

import type { AssetResolver } from "types/overrides";
import { debug, error } from "../adapters/logger";
import { NO_STORE_CACHE_CONTROL } from "../utils/cacheHeaders";
import { cacheInterceptor } from "./routing/cacheInterceptor";
import { detectLocale } from "./routing/i18n";
import {
  fixDataPage,
  getNextConfigHeaders,
  handleBeforeFilesRewrites,
  handleFallbackFalse,
  handleRedirects,
  handleRewrites,
} from "./routing/matcher";
import { handleMiddleware } from "./routing/middleware";
import {
  dynamicRouteMatcher,
  staticRouteMatcher,
} from "./routing/routeMatcher";
import { hasRouteParamPlaceholder } from "./routing/routeParamPlaceholder";
import { constructNextUrl, normalizeLocationHeader } from "./routing/util";

export const MIDDLEWARE_HEADER_PREFIX = "x-middleware-response-";
export const MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;
export const INTERNAL_HEADER_PREFIX = "x-opennext-";
export const NEXT_CONFIG_HEADER_PREFIX = `${INTERNAL_HEADER_PREFIX}next-config-response-`;
export const NEXT_CONFIG_HEADER_PREFIX_LEN = NEXT_CONFIG_HEADER_PREFIX.length;
export const INTERNAL_HEADER_INITIAL_URL = `${INTERNAL_HEADER_PREFIX}initial-url`;
export const INTERNAL_HEADER_LOCALE = `${INTERNAL_HEADER_PREFIX}locale`;
export const INTERNAL_HEADER_RESOLVED_ROUTES = `${INTERNAL_HEADER_PREFIX}resolved-routes`;
export const INTERNAL_HEADER_REWRITE_STATUS_CODE = `${INTERNAL_HEADER_PREFIX}rewrite-status-code`;
export const INTERNAL_EVENT_REQUEST_ID = `${INTERNAL_HEADER_PREFIX}request-id`;

// Geolocation headers starting from Nextjs 15
// See https://github.com/vercel/vercel/blob/7714b1c/packages/functions/src/headers.ts
const geoHeaderToNextHeader = {
  "x-open-next-city": "x-vercel-ip-city",
  "x-open-next-country": "x-vercel-ip-country",
  "x-open-next-region": "x-vercel-ip-country-region",
  "x-open-next-latitude": "x-vercel-ip-latitude",
  "x-open-next-longitude": "x-vercel-ip-longitude",
};

// Those are internal headers from Next.js that should not be set by users
// We strip them for the incoming request - To be updated when Next.js adds new internal headers
// https://github.com/vercel/next.js/blob/ed1c6cc/packages/next/src/server/lib/server-ipc/utils.ts#L42-L53
// NOTE: Use lowercase format.
const NEXT_INTERNAL_HEADERS = [
  "x-middleware-rewrite",
  "x-middleware-redirect",
  "x-middleware-set-cookie",
  "x-middleware-skip",
  "x-middleware-override-headers",
  "x-middleware-next",
  "x-now-route-matches",
  "x-matched-path",
  "x-nextjs-data",
  "x-next-resume-state-length",
  "next-resume",
];

type RoutingResponseHeaders = Record<string, string | string[] | undefined>;

/**
 * Adds the `next.config` and middleware response headers to an event or result.
 *
 * On an event, each kind gets its own prefix so that the request handler can tell them apart (see
 * `splitRoutingHeaders`). On a result, the headers are the response and are not prefixed.
 *
 * `nextConfigHeaders` take precedence over `middlewareHeaders` on the response.
 *
 * @param eventOrResult The event or result to add the headers to, its headers are mutated
 * @param nextConfigHeaders The response headers from the `next.config` `headers()`
 * @param middlewareHeaders The response headers set by the middleware
 */
function applyResponseHeaders(
  eventOrResult: InternalEvent | InternalResult,
  nextConfigHeaders: RoutingResponseHeaders,
  middlewareHeaders: RoutingResponseHeaders,
) {
  const isResult = isInternalResult(eventOrResult);
  const headers = eventOrResult.headers;
  const addHeaders = (source: RoutingResponseHeaders, keyPrefix: string) => {
    for (const [key, value] of Object.entries(source)) {
      if (value) {
        headers[keyPrefix + key] = Array.isArray(value)
          ? value.join(",")
          : value;
      }
    }
  };
  addHeaders(middlewareHeaders, isResult ? "" : MIDDLEWARE_HEADER_PREFIX);
  addHeaders(nextConfigHeaders, isResult ? "" : NEXT_CONFIG_HEADER_PREFIX);
}

export default async function routingHandler(
  event: InternalEvent,
  { assetResolver }: { assetResolver?: AssetResolver },
): Promise<InternalResult | RoutingResult> {
  try {
    // Add Next geo headers
    for (const [openNextGeoName, nextGeoName] of Object.entries(
      geoHeaderToNextHeader,
    )) {
      const value = event.headers[openNextGeoName];
      if (value) {
        event.headers[nextGeoName] = value;
      }
    }

    // First we remove internal headers
    // We don't want to allow users to set these headers
    for (const key of Object.keys(event.headers)) {
      const lowerCaseKey = key.toLowerCase();
      if (
        lowerCaseKey.startsWith(INTERNAL_HEADER_PREFIX) ||
        lowerCaseKey.startsWith(MIDDLEWARE_HEADER_PREFIX) ||
        NEXT_INTERNAL_HEADERS.includes(lowerCaseKey)
      ) {
        delete event.headers[key];
      }
    }

    let nextConfigHeaders: RoutingResponseHeaders = getNextConfigHeaders(
      event,
      ConfigHeaders,
    );

    let eventOrResult = fixDataPage(event, BuildId);

    if (isInternalResult(eventOrResult)) {
      return eventOrResult;
    }

    const redirect = handleRedirects(eventOrResult, RoutesManifest.redirects);
    if (redirect) {
      // We need to encode the value in the Location header to make sure it is valid according to RFC
      redirect.headers.Location = normalizeLocationHeader(
        redirect.headers.Location as string,
        event.url,
        true,
      );
      debug("redirect", redirect);
      return redirect;
    }
    const middlewareEventOrResult = await handleMiddleware(
      eventOrResult,
      // We need to pass the initial search without any decoding
      // TODO: we'd need to refactor InternalEvent to include the initial querystring directly
      // Should be done in another PR because it is a breaking change
      new URL(event.url).search,
    );
    if (isInternalResult(middlewareEventOrResult)) {
      return middlewareEventOrResult;
    }

    const middlewareHeadersPrioritized =
      globalThis.openNextConfig.dangerous
        ?.middlewareHeadersOverrideNextConfigHeaders ?? false;

    const middlewareHeaders: RoutingResponseHeaders =
      middlewareEventOrResult.responseHeaders ?? {};

    if (middlewareHeadersPrioritized) {
      // Both are keyed by lowercase name.
      nextConfigHeaders = Object.fromEntries(
        Object.entries(nextConfigHeaders).filter(
          ([key]) => !Object.hasOwn(middlewareHeaders, key),
        ),
      );
    }

    let isExternalRewrite = middlewareEventOrResult.isExternalRewrite ?? false;
    eventOrResult = middlewareEventOrResult;

    if (!isExternalRewrite) {
      // First rewrite to be applied
      const beforeRewrite = handleBeforeFilesRewrites(
        eventOrResult,
        RoutesManifest.rewrites.beforeFiles,
      );
      eventOrResult = beforeRewrite.internalEvent;
      isExternalRewrite = beforeRewrite.isExternalRewrite;
      // Check for matching public files after `beforeFiles` rewrites
      // See:
      // - https://nextjs.org/docs/app/api-reference/file-conventions/middleware#execution-order
      // - https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
      if (!isExternalRewrite) {
        const assetResult =
          await assetResolver?.maybeGetAssetResult?.(eventOrResult);
        if (assetResult) {
          applyResponseHeaders(
            assetResult,
            nextConfigHeaders,
            middlewareHeaders,
          );
          return assetResult;
        }
      }
    }
    const foundStaticRoute = staticRouteMatcher(eventOrResult.rawPath);
    const isStaticRoute = !isExternalRewrite && foundStaticRoute.length > 0;

    if (!(isStaticRoute || isExternalRewrite)) {
      // Second rewrite to be applied
      const afterRewrite = handleRewrites(
        eventOrResult,
        RoutesManifest.rewrites.afterFiles,
      );
      eventOrResult = afterRewrite.internalEvent;
      isExternalRewrite = afterRewrite.isExternalRewrite;
    }

    let isISR = false;
    // We want to run this just before the dynamic route check
    // We can skip it if its an external rewrite
    if (!isExternalRewrite) {
      const fallbackResult = handleFallbackFalse(
        eventOrResult,
        PrerenderManifest,
      );
      eventOrResult = fallbackResult.event;
      isISR = fallbackResult.isISR;
    }

    const foundDynamicRoute = dynamicRouteMatcher(eventOrResult.rawPath);
    const isDynamicRoute = !isExternalRewrite && foundDynamicRoute.length > 0;

    if (!(isDynamicRoute || isStaticRoute || isExternalRewrite)) {
      // Fallback rewrite to be applied
      const fallbackRewrites = handleRewrites(
        eventOrResult,
        RoutesManifest.rewrites.fallback,
      );
      eventOrResult = fallbackRewrites.internalEvent;
      isExternalRewrite = fallbackRewrites.isExternalRewrite;
    }

    const isNextImageRoute = eventOrResult.rawPath.startsWith("/_next/image");

    const isRouteFoundBeforeAllRewrites =
      isStaticRoute || isDynamicRoute || isExternalRewrite;

    // Resolve against the final internal pathname after every rewrite phase.
    // These ordered matches are also the authoritative cache owner candidates.
    let resolvedRoutes: ResolvedRoute[] = [
      ...staticRouteMatcher(eventOrResult.rawPath),
      ...dynamicRouteMatcher(eventOrResult.rawPath),
    ];

    // If we still haven't found a route, we show the 404 page
    // We need to ensure that rewrites are applied before showing the 404 page
    if (
      !(
        isRouteFoundBeforeAllRewrites ||
        isNextImageRoute ||
        // We need to check again once all rewrites have been applied
        staticRouteMatcher(eventOrResult.rawPath).length > 0 ||
        dynamicRouteMatcher(eventOrResult.rawPath).length > 0
      ) ||
      // Next.js versions before 16.4.5 treat a param whose value is its placeholder (e.g. `[slug]`) as unresolved.
      // Next.js receives both the rawPath and the URL pathname, which is normalized (e.g. dot segments).
      (!isExternalRewrite &&
        [eventOrResult.rawPath, new URL(eventOrResult.url).pathname].some(
          hasRouteParamPlaceholder,
        ))
    ) {
      resolvedRoutes = [];
      eventOrResult = {
        ...eventOrResult,
        rawPath: "/404",
        url: constructNextUrl(eventOrResult.url, "/404"),
        headers: {
          ...eventOrResult.headers,
          "x-middleware-response-cache-control": NO_STORE_CACHE_CONTROL,
        },
      };
    }

    if (
      globalThis.openNextConfig.dangerous?.enableCacheInterception &&
      !isExternalRewrite &&
      !isInternalResult(eventOrResult)
    ) {
      debug("Cache interception enabled");
      eventOrResult = await cacheInterceptor(eventOrResult, resolvedRoutes);
      if (isInternalResult(eventOrResult)) {
        applyResponseHeaders(
          eventOrResult,
          nextConfigHeaders,
          middlewareHeaders,
        );
        return eventOrResult;
      }
    }

    // We apply the response headers last
    applyResponseHeaders(eventOrResult, nextConfigHeaders, middlewareHeaders);

    debug("resolvedRoutes", resolvedRoutes);

    return {
      internalEvent: eventOrResult,
      isExternalRewrite,
      origin: false,
      isISR,
      resolvedRoutes,
      initialURL: event.url,
      locale: NextConfig.i18n
        ? detectLocale(eventOrResult, NextConfig.i18n)
        : undefined,
      rewriteStatusCode: middlewareEventOrResult.rewriteStatusCode,
    };
  } catch (e) {
    error("Error in routingHandler", e);
    // In case of an error, we want to return the 500 page from Next.js
    return {
      internalEvent: {
        type: "core",
        method: "GET",
        rawPath: "/500",
        url: constructNextUrl(event.url, "/500"),
        headers: {
          ...event.headers,
        },
        query: event.query,
        cookies: event.cookies,
        remoteAddress: event.remoteAddress,
      },
      isExternalRewrite: false,
      origin: false,
      isISR: false,
      resolvedRoutes: [],
      initialURL: event.url,
      locale: NextConfig.i18n
        ? detectLocale(event, NextConfig.i18n)
        : undefined,
    };
  }
}

/**
 * @param eventOrResult
 * @returns Whether the event is an instance of `InternalResult`
 */
function isInternalResult(
  eventOrResult: InternalEvent | InternalResult,
): eventOrResult is InternalResult {
  return eventOrResult != null && "statusCode" in eventOrResult;
}
