import { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextNodeResponse } from "http/index.js";
import { IncomingMessage } from "http/index.js";
import type {
  InternalEvent,
  InternalResult,
  ResolvedRoute,
  RoutingResult,
} from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";

import { NextConfig } from "config/index";
import type { OpenNextHandlerOptions } from "types/overrides";
import { debug, error, warn } from "../adapters/logger";
import { patchAsyncStorage } from "./patchAsyncStorage";
import {
  constructNextUrl,
  convertRes,
  convertToQuery,
  createServerResponse,
} from "./routing/util";
import routingHandler, {
  INTERNAL_HEADER_INITIAL_URL,
  INTERNAL_HEADER_RESOLVED_ROUTES,
  MIDDLEWARE_HEADER_PREFIX,
  MIDDLEWARE_HEADER_PREFIX_LEN,
} from "./routingHandler";
import { requestHandler, setNextjsPrebundledReact } from "./util";

// This is used to identify requests in the cache
globalThis.__openNextAls = new AsyncLocalStorage();

patchAsyncStorage();

export async function openNextHandler(
  internalEvent: InternalEvent,
  options?: OpenNextHandlerOptions,
): Promise<InternalResult> {
  const initialHeaders = internalEvent.headers;
  // We run everything in the async local storage context so that it is available in the middleware as well as in NextServer
  return runWithOpenNextRequestContext(
    {
      isISRRevalidation: initialHeaders["x-isr"] === "1",
      waitUntil: options?.waitUntil,
    },
    async () => {
      if (initialHeaders["x-forwarded-host"]) {
        initialHeaders.host = initialHeaders["x-forwarded-host"];
      }
      debug("internalEvent", internalEvent);

      // These 2 will get overwritten by the routing handler if not using an external middleware
      const internalHeaders = {
        initialPath:
          initialHeaders[INTERNAL_HEADER_INITIAL_URL] ?? internalEvent.rawPath,
        resolvedRoutes: initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES]
          ? JSON.parse(initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES])
          : ([] as ResolvedRoute[]),
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
      try {
        routingResult = await routingHandler(internalEvent);
      } catch (e) {
        warn("Routing failed.", e);
      }
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
        overwrittenResponseHeaders[key] = value;
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
            headers,
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
        headers: { ...headers, purpose: "prefetch" },
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

async function processRequest(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  routingResult: RoutingResult,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    //#override applyNextjsPrebundledReact
    setNextjsPrebundledReact(routingResult.internalEvent.rawPath);
    //#endOverride

    // Here we try to apply as much request metadata as possible
    // We apply every metadata from `resolve-routes` https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/router-utils/resolve-routes.ts
    // and `router-server` https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/router-server.ts
    const initialURL = new URL(routingResult.initialURL);
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
    // Next Server
    await requestHandler(requestMetadata)(req, res);
  } catch (e: any) {
    // This might fail when using bundled next, importing won't do the trick either
    if (e.constructor.name === "NoFallbackError") {
      // Do we need to handle _not-found
      // Ideally this should never get triggered and be intercepted by the routing handler
      await tryRenderError("404", res, routingResult.internalEvent);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, routingResult.internalEvent);
    }
  }
}

async function tryRenderError(
  type: "404" | "500",
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
    // By setting this it will allow us to bypass and directly render the 404 or 500 page
    const requestMetadata = {
      // By setting invokePath and invokeQuery we can bypass some of the routing logic in Next.js
      invokePath: type === "404" ? "/404" : "/500",
      invokeStatus: type === "404" ? 404 : 500,
      middlewareInvoke: false,
    };
    await requestHandler(requestMetadata)(_req, res);
  } catch (e) {
    error("NextJS request failed.", e);
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
