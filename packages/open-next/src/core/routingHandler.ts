import {
  AppPathRoutesManifest,
  BuildId,
  ConfigHeaders,
  PrerenderManifest,
  RoutesManifest,
} from "config/index";
import type { RouteDefinition } from "types/next-types";
import type {
  InternalEvent,
  InternalResult,
  ResolvedRoute,
  RouteType,
  RoutingResult,
} from "types/open-next";

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
export const INTERNAL_HEADER_PREFIX = "x-opennext-";
export const INTERNAL_HEADER_INITIAL_PATH = `${INTERNAL_HEADER_PREFIX}initial-path`;
export const INTERNAL_HEADER_RESOLVED_ROUTES = `${INTERNAL_HEADER_PREFIX}resolved-routes`;
export const MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;

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

export function routeMatcher(routeDefinitions: RouteDefinition[]) {
  const regexp = routeDefinitions.map((route) => {
    return {
      page: route.page,
      regexp: new RegExp(
        route.regex
          .replace("^/", optionalLocalePrefixRegex)
          .replace("^/", optionalBasepathPrefixRegex),
      ),
    };
  });

  // We need to use AppPathRoutesManifest here
  const appPathsSet = new Set(
    Object.entries(AppPathRoutesManifest)
      .filter(([key, _]) => key.endsWith("page"))
      .map(([_, value]) => value),
  );
  const routePathsSet = new Set(
    Object.entries(AppPathRoutesManifest)
      .filter(([key, _]) => key.endsWith("route"))
      .map(([_, value]) => value),
  );
  return function matchRoute(path: string) {
    const foundRoutes = regexp.filter((route) => route.regexp.test(path));

    if (foundRoutes.length > 0) {
      return foundRoutes.map((foundRoute) => {
        const routeType: RouteType | undefined = appPathsSet.has(
          foundRoute.page,
        )
          ? "app"
          : routePathsSet.has(foundRoute.page)
            ? "route"
            : "page";
        return {
          route: foundRoute.page,
          type: routeType,
        };
      });
    }
    return false;
  };
}

const staticRouteMatcher = routeMatcher(RoutesManifest.routes.static);
const dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);

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
    debug("redirect", redirect);
    return redirect;
  }

  const eventOrResult = await handleMiddleware(internalEvent);
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
  const isStaticRoute = !isExternalRewrite && Boolean(foundStaticRoute);

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

  const foundDynamicRoute = dynamicRouteMatcher(internalEvent.rawPath);
  const isDynamicRoute = !isExternalRewrite && Boolean(foundDynamicRoute);

  if (!(isDynamicRoute || isStaticRoute || isExternalRewrite)) {
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
    !(
      isRouteFoundBeforeAllRewrites ||
      isApiRoute ||
      isNextImageRoute ||
      // We need to check again once all rewrites have been applied
      staticRouteMatcher(internalEvent.rawPath) ||
      dynamicRouteMatcher(internalEvent.rawPath)
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

  const resolvedRoutes: ResolvedRoute[] = [
    ...(Array.isArray(foundStaticRoute) ? foundStaticRoute : []),
    ...(Array.isArray(foundDynamicRoute) ? foundDynamicRoute : []),
  ];

  console.log("resolvedRoutes", resolvedRoutes);

  return {
    internalEvent,
    isExternalRewrite,
    origin: false,
    isISR,
    initialPath: event.rawPath,
    resolvedRoutes,
  };
}
