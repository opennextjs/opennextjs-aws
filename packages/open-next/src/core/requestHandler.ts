import { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextNodeResponse } from "http/index.js";
import { IncomingMessage } from "http/index.js";
import type {
  InternalEvent,
  InternalResult,
  ResolvedRoute,
  RoutingResult,
} from "types/open-next";
import { ISR_HEADER } from "utils/cacheHeaders";
import { runWithOpenNextRequestContext } from "utils/promise";
import { compareSemver } from "utils/semver";

import { NextConfig } from "config/index";
import type { OpenNextHandlerOptions } from "types/overrides";
import { debug, error } from "../adapters/logger";
import { patchAsyncStorage } from "./patchAsyncStorage";
import { getRouteMatchMetadata } from "./routeMatchMetadata";
import {
  constructNextUrl,
  convertRes,
  convertToQuery,
  createServerResponse,
} from "./routing/util";
import routingHandler, {
  INTERNAL_EVENT_REQUEST_ID,
  INTERNAL_HEADER_REWRITE_STATUS_CODE,
  INTERNAL_HEADER_INITIAL_URL,
  INTERNAL_HEADER_RESOLVED_ROUTES,
  MIDDLEWARE_HEADER_PREFIX,
  MIDDLEWARE_HEADER_PREFIX_LEN,
} from "./routingHandler";
import { requestHandler, setNextjsPrebundledReact } from "./util";

// This is used to identify requests in the cache
globalThis.__openNextAls = new AsyncLocalStorage();

//#override patchAsyncStorage
patchAsyncStorage();
//#endOverride

export async function openNextHandler(
  internalEvent: InternalEvent,
  options?: OpenNextHandlerOptions,
): Promise<InternalResult> {
  const initialHeaders = internalEvent.headers;
  // We only use the requestId header if we are using an external middleware
  // This is to ensure that no one can spoof the requestId
  // When using an external middleware, we always assume that headers cannot be spoofed
  const requestId = globalThis.openNextConfig.middleware?.external
    ? internalEvent.headers[INTERNAL_EVENT_REQUEST_ID]
    : Math.random().toString(36);
  // We run everything in the async local storage context so that it is available in the middleware as well as in NextServer
  return runWithOpenNextRequestContext(
    {
      isISRRevalidation: initialHeaders[ISR_HEADER] === "1",
      waitUntil: options?.waitUntil,
      requestId,
    },
    async () => {
      await globalThis.__next_route_preloader("waitUntil");
      if (initialHeaders["x-forwarded-host"]) {
        initialHeaders.host = initialHeaders["x-forwarded-host"];
      }
      debug("internalEvent", internalEvent);

      // These 3 will get overwritten by the routing handler if not using an external middleware
      const internalHeaders = {
        initialPath:
          initialHeaders[INTERNAL_HEADER_INITIAL_URL] ?? internalEvent.rawPath,
        resolvedRoutes: initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES]
          ? JSON.parse(initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES])
          : ([] as ResolvedRoute[]),
        rewriteStatusCode: Number.parseInt(
          initialHeaders[INTERNAL_HEADER_REWRITE_STATUS_CODE],
        ),
      };

      let routingResult: InternalResult | RoutingResult = {
        internalEvent,
        isExternalRewrite: false,
        origin: false,
        isISR: false,
        initialURL: internalEvent.url,
        ...internalHeaders,
      };

      //#override withRouting
      routingResult = await routingHandler(internalEvent, {
        assetResolver: globalThis.assetResolver,
      });
      //#endOverride

      const headers =
        "type" in routingResult
          ? routingResult.headers
          : routingResult.internalEvent.headers;

      const overwrittenResponseHeaders: Record<string, string | string[]> = {};

      for (const [rawKey, value] of Object.entries(headers)) {
        if (!rawKey.startsWith(MIDDLEWARE_HEADER_PREFIX)) {
          continue;
        }
        const key = rawKey.slice(MIDDLEWARE_HEADER_PREFIX_LEN);
        // We skip this header here since it is used by Next internally and we don't want it on the response headers.
        // This header needs to be present in the request headers for processRequest, so cookies().get() from Next will work on initial render.
        if (key !== "x-middleware-set-cookie") {
          overwrittenResponseHeaders[key] = value;
        }
        headers[key] = value;
        delete headers[rawKey];
      }

      if (
        "isExternalRewrite" in routingResult &&
        routingResult.isExternalRewrite === true
      ) {
        try {
          routingResult = await globalThis.proxyExternalRequest.proxy(
            routingResult.internalEvent,
          );
        } catch (e) {
          error("External request failed.", e);
          routingResult = {
            internalEvent: {
              type: "core",
              rawPath: "/500",
              method: "GET",
              headers: {},
              url: constructNextUrl(internalEvent.url, "/500"),
              query: {},
              cookies: {},
              remoteAddress: "",
            },
            // On error we need to rewrite to the 500 page which is an internal rewrite
            isExternalRewrite: false,
            isISR: false,
            origin: false,
            initialURL: internalEvent.url,
            resolvedRoutes: [{ route: "/500", type: "page" }],
          };
        }
      }

      if ("type" in routingResult) {
        // response is used only in the streaming case
        if (options?.streamCreator) {
          const response = createServerResponse(
            {
              internalEvent,
              isExternalRewrite: false,
              isISR: false,
              resolvedRoutes: [],
              origin: false,
              initialURL: internalEvent.url,
            },
            routingResult.headers,
            options.streamCreator,
          );
          response.statusCode = routingResult.statusCode;
          response.flushHeaders();
          const [bodyToConsume, bodyToReturn] = routingResult.body.tee();
          for await (const chunk of bodyToConsume) {
            response.write(chunk);
          }
          response.end();
          routingResult.body = bodyToReturn;
        }
        return routingResult;
      }

      const preprocessedEvent = routingResult.internalEvent;
      debug("preprocessedEvent", preprocessedEvent);
      const { search, pathname, hash } = new URL(preprocessedEvent.url);
      const reqProps = {
        method: preprocessedEvent.method,
        url: `${pathname}${search}${hash}`,
        //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
        // There is 3 way we can handle revalidation:
        // 1. We could just let the revalidation go as normal, but due to race conditions the revalidation will be unreliable
        // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
        // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
        headers: {
          ...headers,
          //#override appendPrefetch
          purpose: "prefetch",
          //#endOverride
        },
        body: preprocessedEvent.body,
        remoteAddress: preprocessedEvent.remoteAddress,
      };

      const mergeHeadersPriority = globalThis.openNextConfig.dangerous
        ?.headersAndCookiesPriority
        ? globalThis.openNextConfig.dangerous.headersAndCookiesPriority(
            preprocessedEvent,
          )
        : "middleware";
      const store = globalThis.__openNextAls.getStore();
      if (store) {
        store.mergeHeadersPriority = mergeHeadersPriority;
      }

      const req = new IncomingMessage(reqProps);
      const res = createServerResponse(
        routingResult,
        overwrittenResponseHeaders,
        options?.streamCreator,
      );

      await processRequest(req, res, routingResult);

      const {
        statusCode,
        headers: responseHeaders,
        isBase64Encoded,
        body,
      } = convertRes(res);

      const internalResult = {
        type: internalEvent.type,
        statusCode,
        headers: responseHeaders,
        body,
        isBase64Encoded,
      };

      return internalResult;
    },
  );
}

/**
 * Applies routing metadata and invokes the Next.js request handler.
 *
 * @param req The request passed to Next.js
 * @param res The response populated by Next.js
 * @param routingResult The resolved OpenNext route and request metadata
 * @return A promise that resolves after Next.js handles the request
 */
async function processRequest(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  routingResult: RoutingResult,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  // Here we try to apply as much request metadata as possible
  // We apply every metadata from `resolve-routes` https://github.com/vercel/next.js/blob/916f105b97211de50f8580f0b39c9e7c60de4886/packages/next/src/server/lib/router-utils/resolve-routes.ts
  // and `router-server` https://github.com/vercel/next.js/blob/916f105b97211de50f8580f0b39c9e7c60de4886/packages/next/src/server/lib/router-server.ts
  const initialURL = new URL(
    // We always assume that only the routing layer can set this header.
    routingResult.internalEvent.headers[INTERNAL_HEADER_INITIAL_URL] ??
      routingResult.initialURL,
  );
  let invokeStatus: number | undefined;
  if (routingResult.internalEvent.rawPath === "/500") {
    invokeStatus = 500;
  } else if (routingResult.internalEvent.rawPath === "/404") {
    invokeStatus = 404;
  }
  const requestMetadata = {
    isNextDataReq: routingResult.internalEvent.query.__nextDataReq === "1",
    initURL: routingResult.initialURL,
    initQuery: convertToQuery(initialURL.search),
    initProtocol: initialURL.protocol,
    defaultLocale: NextConfig.i18n?.defaultLocale,
    locale: routingResult.locale,
    middlewareInvoke: false,
    // By setting invokePath and invokeQuery we can bypass some of the routing logic in Next.js
    invokePath: routingResult.internalEvent.rawPath,
    invokeQuery: routingResult.internalEvent.query,
    // invokeStatus is only used for error pages
    invokeStatus,
  };

  try {
    //#override applyNextjsPrebundledReact
    setNextjsPrebundledReact(routingResult.internalEvent.rawPath);
    //#endOverride

    // Next Server
    // TODO: only enable this on Next 15.4+
    // We need to set the pathname to the data request path
    //#override setInitialURL
    // `invokeQuery` carries destination query values for server APIs, while
    // `req.url` remains the browser-visible URL used by the App Router state.
    req.url = initialURL.pathname + initialURL.search;
    //#endOverride

    await requestHandler(requestMetadata)(req, res);
  } catch (e: any) {
    // This might fail when using bundled next, importing won't do the trick either
    if (e.constructor.name === "NoFallbackError") {
      await handleNoFallbackError(req, res, routingResult, requestMetadata);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, routingResult.internalEvent);
    }
  }
}

/**
 * Retries the next resolved route after Next.js rejects a fallback.
 *
 * Next.js 16.4+ requires an explicit match; older versions retain their own
 * route matching and parameter-decoding error handling. Malformed parameters
 * encountered while constructing a 16.4+ match produce a bad-request response.
 *
 * @param req The request reused for each rendering attempt
 * @param res The response populated by Next.js
 * @param routingResult The ordered route candidates and internal request
 * @param metadata The request metadata retained from the previous attempt
 * @param index The next route candidate to try
 * @return A promise that resolves after rendering a route or an error response
 */
export async function handleNoFallbackError(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  routingResult: RoutingResult,
  metadata: Record<string, unknown>,
  index = 1,
) {
  if (index >= 5) {
    await tryRenderError("500", res, routingResult.internalEvent);
    return;
  }
  if (index >= routingResult.resolvedRoutes.length) {
    await tryRenderError("404", res, routingResult.internalEvent);
    return;
  }
  const route = routingResult.resolvedRoutes[index].route;
  try {
    // Skip the call itself on older versions: decoding here can change their error handling.
    let routeMatchMetadata = {};
    if (compareSemver(globalThis.nextVersion, ">=", "16.4.0")) {
      try {
        routeMatchMetadata = getRouteMatchMetadata(
          route,
          routingResult.internalEvent.rawPath,
        );
      } catch (e) {
        // Only match decoding is a bad request; rendering errors still use the 500 path.
        if (!(e instanceof URIError)) {
          throw e;
        }
        await tryRenderError("400", res, routingResult.internalEvent);
        return;
      }
    }
    await requestHandler({
      ...routingResult,
      invokeOutput: route,
      ...metadata,
      // Must come after `metadata` to override the stale `match` of the previous attempt.
      ...routeMatchMetadata,
    })(req, res);
  } catch (e: any) {
    if (e.constructor.name === "NoFallbackError") {
      await handleNoFallbackError(req, res, routingResult, metadata, index + 1);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, routingResult.internalEvent);
    }
  }
}

/**
 * Renders a Next.js error response with fresh request metadata.
 *
 * Falls back to a JSON 500 response if rendering the error page fails.
 *
 * @param type The HTTP error status to render
 * @param res The response populated by Next.js
 * @param internalEvent The request supplying headers, body, and remote address
 * @return A promise that resolves after writing the error response
 */
async function tryRenderError(
  type: "400" | "404" | "500",
  res: OpenNextNodeResponse,
  internalEvent: InternalEvent,
) {
  try {
    const _req = new IncomingMessage({
      method: "GET",
      url: `/${type}`,
      headers: internalEvent.headers,
      body: internalEvent.body,
      remoteAddress: internalEvent.remoteAddress,
    });
    // Bypass route matching and directly render the requested error response.
    const requestMetadata = {
      // By setting invokePath and invokeQuery we can bypass some of the routing logic in Next.js
      invokePath: `/${type}`,
      invokeStatus: Number(type),
      middlewareInvoke: false,
    };
    await requestHandler(requestMetadata)(_req, res);
  } catch (e) {
    error("NextJS request failed.", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          message: "Server failed to respond.",
          details: e,
        },
        null,
        2,
      ),
    );
  }
}
