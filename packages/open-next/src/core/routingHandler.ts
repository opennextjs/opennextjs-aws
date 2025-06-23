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

import { debug, error } from "../adapters/logger";
import { cacheInterceptor } from "./routing/cacheInterceptor";
import { detectLocale } from "./routing/i18n";
import {
  fixDataPage,
  getNextConfigHeaders,
  handleFallbackFalse,
  handleRedirects,
  handleRewrites,
} from "./routing/matcher";
import { handleMiddleware } from "./routing/middleware";
import {
  dynamicRouteMatcher,
  staticRouteMatcher,
} from "./routing/routeMatcher";
import { constructNextUrl } from "./routing/util";

export const MIDDLEWARE_HEADER_PREFIX = "x-middleware-response-";
export const MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;
export const INTERNAL_HEADER_PREFIX = "x-opennext-";
export const INTERNAL_HEADER_INITIAL_URL = `${INTERNAL_HEADER_PREFIX}initial-url`;
export const INTERNAL_HEADER_LOCALE = `${INTERNAL_HEADER_PREFIX}locale`;
export const INTERNAL_HEADER_RESOLVED_ROUTES = `${INTERNAL_HEADER_PREFIX}resolved-routes`;
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

function applyMiddlewareHeaders(
  eventHeaders: Record<string, string | string[]>,
  middlewareHeaders: Record<string, string | string[] | undefined>,
  setPrefix = true,
) {
  const keyPrefix = setPrefix ? MIDDLEWARE_HEADER_PREFIX : "";
  Object.entries(middlewareHeaders).forEach(([key, value]) => {
    if (value) {
      eventHeaders[keyPrefix + key] = Array.isArray(value)
        ? value.join(",")
        : value;
    }
  });
}

export default async function routingHandler(
  event: InternalEvent,
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
      if (
        key.startsWith(INTERNAL_HEADER_PREFIX) ||
        key.startsWith(MIDDLEWARE_HEADER_PREFIX)
      ) {
        delete event.headers[key];
      }
    }

    const nextHeaders = getNextConfigHeaders(event, ConfigHeaders);

    let internalEvent = fixDataPage(event, BuildId);
    if ("statusCode" in internalEvent) {
      return internalEvent;
    }

    const redirect = handleRedirects(internalEvent, RoutesManifest.redirects);
    if (redirect) {
      // We need to encode the value in the Location header to make sure it is valid according to RFC
      // https://stackoverflow.com/a/7654605/16587222
      redirect.headers.Location = new URL(
        redirect.headers.Location as string,
      ).href;
      debug("redirect", redirect);
      return redirect;
    }

    const eventOrResult = await handleMiddleware(
      internalEvent,
      // We need to pass the initial search without any decoding
      // TODO: we'd need to refactor InternalEvent to include the initial querystring directly
      // Should be done in another PR because it is a breaking change
      new URL(event.url).search,
    );
    const isResult = "statusCode" in eventOrResult;
    if (isResult) {
      return eventOrResult;
    }
    const middlewareResponseHeaders = eventOrResult.responseHeaders;
    let isExternalRewrite = eventOrResult.isExternalRewrite ?? false;
    // internalEvent is `InternalEvent | MiddlewareEvent`
    internalEvent = eventOrResult;

    if (!isExternalRewrite) {
      // First rewrite to be applied
      const beforeRewrites = handleRewrites(
        internalEvent,
        RoutesManifest.rewrites.beforeFiles,
      );
      internalEvent = beforeRewrites.internalEvent;
      isExternalRewrite = beforeRewrites.isExternalRewrite;
    }
    const foundStaticRoute = staticRouteMatcher(internalEvent.rawPath);
    const isStaticRoute = !isExternalRewrite && foundStaticRoute.length > 0;

    if (!(isStaticRoute || isExternalRewrite)) {
      // Second rewrite to be applied
      const afterRewrites = handleRewrites(
        internalEvent,
        RoutesManifest.rewrites.afterFiles,
      );
      internalEvent = afterRewrites.internalEvent;
      isExternalRewrite = afterRewrites.isExternalRewrite;
    }

    let isISR = false;
    // We want to run this just before the dynamic route check
    // We can skip it if its an external rewrite
    if (!isExternalRewrite) {
      const fallbackResult = handleFallbackFalse(
        internalEvent,
        PrerenderManifest,
      );
      internalEvent = fallbackResult.event;
      isISR = fallbackResult.isISR;
    }

    const foundDynamicRoute = dynamicRouteMatcher(internalEvent.rawPath);
    const isDynamicRoute = !isExternalRewrite && foundDynamicRoute.length > 0;

    if (!(isDynamicRoute || isStaticRoute || isExternalRewrite)) {
      // Fallback rewrite to be applied
      const fallbackRewrites = handleRewrites(
        internalEvent,
        RoutesManifest.rewrites.fallback,
      );
      internalEvent = fallbackRewrites.internalEvent;
      isExternalRewrite = fallbackRewrites.isExternalRewrite;
    }

    const isNextImageRoute = internalEvent.rawPath.startsWith("/_next/image");

    const isRouteFoundBeforeAllRewrites =
      isStaticRoute || isDynamicRoute || isExternalRewrite;

    // If we still haven't found a route, we show the 404 page
    // We need to ensure that rewrites are applied before showing the 404 page
    if (
      !(
        isRouteFoundBeforeAllRewrites ||
        isNextImageRoute ||
        // We need to check again once all rewrites have been applied
        staticRouteMatcher(internalEvent.rawPath).length > 0 ||
        dynamicRouteMatcher(internalEvent.rawPath).length > 0
      )
    ) {
      internalEvent = {
        ...internalEvent,
        rawPath: "/404",
        url: constructNextUrl(internalEvent.url, "/404"),
        headers: {
          ...internalEvent.headers,
          "x-middleware-response-cache-control":
            "private, no-cache, no-store, max-age=0, must-revalidate",
        },
      };
    }

    if (
      globalThis.openNextConfig.dangerous?.enableCacheInterception &&
      !("statusCode" in internalEvent)
    ) {
      debug("Cache interception enabled");
      internalEvent = await cacheInterceptor(internalEvent);
      if ("statusCode" in internalEvent) {
        applyMiddlewareHeaders(
          internalEvent.headers,
          {
            ...middlewareResponseHeaders,
            ...nextHeaders,
          },
          false,
        );
        return internalEvent;
      }
    }

    // We apply the headers from the middleware response last
    applyMiddlewareHeaders(internalEvent.headers, {
      ...middlewareResponseHeaders,
      ...nextHeaders,
    });

    const resolvedRoutes: ResolvedRoute[] = [
      ...foundStaticRoute,
      ...foundDynamicRoute,
    ];

    debug("resolvedRoutes", resolvedRoutes);

    return {
      internalEvent,
      isExternalRewrite,
      origin: false,
      isISR,
      resolvedRoutes,
      initialURL: event.url,
      locale: NextConfig.i18n
        ? detectLocale(internalEvent, NextConfig.i18n)
        : undefined,
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
