import {
  BuildId,
  ConfigHeaders,
  PrerenderManifest,
  RoutesManifest,
} from "config/index";
import type { InternalEvent, InternalResult, Origin } from "types/open-next";

import { debug } from "../adapters/logger";
import { cacheInterceptor } from "./routing/cacheInterceptor";
import {
  fixDataPage,
  getNextConfigHeaders,
  handleFallbackFalse,
  handleRedirects,
  handleRewrites,
} from "./routing/matcher";
import { handleMiddleware } from "./routing/middleware";

export const MIDDLEWARE_HEADER_PREFIX = "x-middleware-response-";
export const MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;
export interface MiddlewareOutputEvent {
  internalEvent: InternalEvent;
  isExternalRewrite: boolean;
  origin: Origin | false;
  isISR: boolean;
}

// Add the locale prefix to the regex so we correctly match the rawPath
const optionalLocalePrefixRegex = RoutesManifest.locales.length
  ? `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`
  : "^/";

// Add the basepath prefix to the regex so we correctly match the rawPath
const optionalBasepathPrefixRegex = RoutesManifest.basePath
  ? `^${RoutesManifest.basePath}/?`
  : "^/";

// Add the basePath prefix to the api routes
const apiPrefix = RoutesManifest.basePath
  ? `${RoutesManifest.basePath}/api`
  : "/api";

const staticRegexp = RoutesManifest.routes.static.map(
  (route) =>
    new RegExp(
      route.regex
        .replace("^/", optionalLocalePrefixRegex)
        .replace("^/", optionalBasepathPrefixRegex),
    ),
);

const dynamicRegexp = RoutesManifest.routes.dynamic.map(
  (route) =>
    new RegExp(
      route.regex
        .replace("^/", optionalLocalePrefixRegex)
        .replace("^/", optionalBasepathPrefixRegex),
    ),
);

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
): Promise<InternalResult | MiddlewareOutputEvent> {
  // Add Next geo headers
  for (const [openNextGeoName, nextGeoName] of Object.entries(
    geoHeaderToNextHeader,
  )) {
    const value = event.headers[openNextGeoName];
    if (value) {
      event.headers[nextGeoName] = value;
    }
  }

  const nextHeaders = getNextConfigHeaders(event, ConfigHeaders);

  let internalEvent = fixDataPage(event, BuildId);
  if ("statusCode" in internalEvent) {
    return internalEvent;
  }

  const redirect = handleRedirects(internalEvent, RoutesManifest.redirects);
  if (redirect) {
    debug("redirect", redirect);
    return redirect;
  }

  const middleware = await handleMiddleware(internalEvent);
  let middlewareResponseHeaders: Record<string, string | string[]> = {};
  if ("statusCode" in middleware) {
    return middleware;
  }
  middlewareResponseHeaders = middleware.responseHeaders || {};
  internalEvent = middleware;

  // At this point internalEvent is an InternalEvent or a MiddlewareOutputEvent

  let isExternalRewrite = middleware.externalRewrite ?? false;
  if (!isExternalRewrite) {
    // First rewrite to be applied
    const beforeRewrites = handleRewrites(
      internalEvent,
      RoutesManifest.rewrites.beforeFiles,
    );
    internalEvent = beforeRewrites.internalEvent;
    isExternalRewrite = beforeRewrites.isExternalRewrite;
  }

  const isStaticRoute =
    !isExternalRewrite &&
    staticRegexp.some((route) =>
      route.test((internalEvent as InternalEvent).rawPath),
    );

  if (!isStaticRoute && !isExternalRewrite) {
    // Second rewrite to be applied
    const afterRewrites = handleRewrites(
      internalEvent,
      RoutesManifest.rewrites.afterFiles,
    );
    internalEvent = afterRewrites.internalEvent;
    isExternalRewrite = afterRewrites.isExternalRewrite;
  }

  // We want to run this just before the dynamic route check
  const { event: fallbackEvent, isISR } = handleFallbackFalse(
    internalEvent,
    PrerenderManifest,
  );
  internalEvent = fallbackEvent;

  const isDynamicRoute =
    !isExternalRewrite &&
    dynamicRegexp.some((route) =>
      route.test((internalEvent as InternalEvent).rawPath),
    );
  if (!isDynamicRoute && !isStaticRoute && !isExternalRewrite) {
    // Fallback rewrite to be applied
    const fallbackRewrites = handleRewrites(
      internalEvent,
      RoutesManifest.rewrites.fallback,
    );
    internalEvent = fallbackRewrites.internalEvent;
    isExternalRewrite = fallbackRewrites.isExternalRewrite;
  }

  // Api routes are not present in the routes manifest except if they're not behind /api
  // /api even if it's a page route doesn't get generated in the manifest
  // Ideally we would need to properly check api routes here
  const isApiRoute =
    internalEvent.rawPath === apiPrefix ||
    internalEvent.rawPath.startsWith(`${apiPrefix}/`);

  const isNextImageRoute = internalEvent.rawPath.startsWith("/_next/image");

  const isRouteFoundBeforeAllRewrites =
    isStaticRoute || isDynamicRoute || isExternalRewrite;

  // If we still haven't found a route, we show the 404 page
  // We need to ensure that rewrites are applied before showing the 404 page
  if (
    !isRouteFoundBeforeAllRewrites &&
    !isApiRoute &&
    !isNextImageRoute &&
    // We need to check again once all rewrites have been applied
    !staticRegexp.some((route) =>
      route.test((internalEvent as InternalEvent).rawPath),
    ) &&
    !dynamicRegexp.some((route) =>
      route.test((internalEvent as InternalEvent).rawPath),
    )
  ) {
    internalEvent = {
      ...internalEvent,
      rawPath: "/404",
      url: "/404",
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

  return {
    internalEvent,
    isExternalRewrite,
    origin: false,
    isISR,
  };
}
