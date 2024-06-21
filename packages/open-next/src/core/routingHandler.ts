import {
  BuildId,
  ConfigHeaders,
  PrerenderManifest,
  RoutesManifest,
} from "config/index";
import { InternalEvent, InternalResult, Origin } from "types/open-next";

import { debug } from "../adapters/logger";
import {
  addNextConfigHeaders,
  fixDataPage,
  handleFallbackFalse,
  handleRedirects,
  handleRewrites,
} from "./routing/matcher";
import { handleMiddleware } from "./routing/middleware";

export interface MiddlewareOutputEvent {
  internalEvent: InternalEvent;
  isExternalRewrite: boolean;
  origin: Origin | false;
}

const staticRegexp = RoutesManifest.routes.static.map(
  (route) => new RegExp(route.regex),
);

const dynamicRegexp = RoutesManifest.routes.dynamic.map(
  (route) => new RegExp(route.regex),
);

const localeRegexp = RoutesManifest.locales.length ? new RegExp(RoutesManifest.locales.map((locale) => `(^/${locale}?/)`).join("|")) : null;

export default async function routingHandler(
  event: InternalEvent,
): Promise<InternalResult | MiddlewareOutputEvent> {
  const nextHeaders = addNextConfigHeaders(event, ConfigHeaders) ?? {};

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
  } else {
    middlewareResponseHeaders = middleware.responseHeaders || {};
    internalEvent = middleware;
  }

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
  let normalizedRawPath = internalEvent.rawPath.replace(localeRegexp, "/");
  const isStaticRoute =
    !isExternalRewrite &&
    staticRegexp.some((route) =>
      route.test(normalizedRawPath),
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
  internalEvent = handleFallbackFalse(internalEvent, PrerenderManifest);
  normalizedRawPath = internalEvent.rawPath.replace(localeRegexp, "/");

  const isDynamicRoute =
    !isExternalRewrite &&
    dynamicRegexp.some((route) =>
      route.test(normalizedRawPath),
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
    internalEvent.rawPath === "/api" ||
    internalEvent.rawPath.startsWith("/api/");

  const isRouteFoundBeforeAllRewrites =
    isStaticRoute || isDynamicRoute || isExternalRewrite;
    
  normalizedRawPath = internalEvent.rawPath.replace(localeRegexp, "/");

  // If we still haven't found a route, we show the 404 page
  // We need to ensure that rewrites are applied before showing the 404 page
  if (
    !isRouteFoundBeforeAllRewrites &&
    !isApiRoute &&
    // We need to check again once all rewrites have been applied
    !staticRegexp.some((route) =>
      route.test(normalizedRawPath),
    ) &&
    !dynamicRegexp.some((route) =>
      route.test(normalizedRawPath),
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

  // We apply the headers from the middleware response last
  Object.entries({
    ...middlewareResponseHeaders,
    ...nextHeaders,
  }).forEach(([key, value]) => {
    if (value) {
      internalEvent.headers[`x-middleware-response-${key}`] = Array.isArray(
        value,
      )
        ? value.join(",")
        : value;
    }
  });

  return {
    internalEvent,
    isExternalRewrite,
    origin: false,
  };
}
