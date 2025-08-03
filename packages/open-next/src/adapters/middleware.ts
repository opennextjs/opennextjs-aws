import type {
  ExternalMiddlewareConfig,
  InternalEvent,
  InternalResult,
  MiddlewareResult,
} from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";

import type { OpenNextHandlerOptions } from "types/overrides";
import { debug, error } from "../adapters/logger";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  resolveAssetResolver,
  resolveIncrementalCache,
  resolveOriginResolver,
  resolveProxyRequest,
  resolveQueue,
  resolveTagCache,
} from "../core/resolve";
import { constructNextUrl } from "../core/routing/util";
import routingHandler, {
  INTERNAL_EVENT_REQUEST_ID,
  INTERNAL_HEADER_REWRITE_STATUS_CODE,
  INTERNAL_HEADER_INITIAL_URL,
  INTERNAL_HEADER_RESOLVED_ROUTES,
} from "../core/routingHandler";

globalThis.internalFetch = fetch;
globalThis.__openNextAls = new AsyncLocalStorage();

const defaultHandler = async (
  internalEvent: InternalEvent,
  options?: OpenNextHandlerOptions,
): Promise<InternalResult | MiddlewareResult> => {
  // We know that the middleware is external when this adapter is used
  const middlewareConfig = globalThis.openNextConfig
    .middleware as ExternalMiddlewareConfig;
  const originResolver = await resolveOriginResolver(
    middlewareConfig?.originResolver,
  );

  const externalRequestProxy = await resolveProxyRequest(
    middlewareConfig?.override?.proxyExternalRequest,
  );

  const assetResolver = await resolveAssetResolver(
    middlewareConfig?.assetResolver,
  );

  //#override includeCacheInMiddleware
  globalThis.tagCache = await resolveTagCache(
    middlewareConfig?.override?.tagCache,
  );

  globalThis.queue = await resolveQueue(middlewareConfig?.override?.queue);

  globalThis.incrementalCache = await resolveIncrementalCache(
    middlewareConfig?.override?.incrementalCache,
  );
  //#endOverride

  const requestId = Math.random().toString(36);

  // We run everything in the async local storage context so that it is available in the external middleware
  return runWithOpenNextRequestContext(
    {
      isISRRevalidation: internalEvent.headers["x-isr"] === "1",
      waitUntil: options?.waitUntil,
      requestId,
    },
    async () => {
      const result = await routingHandler(internalEvent, { assetResolver });
      if ("internalEvent" in result) {
        debug("Middleware intercepted event", internalEvent);
        if (!result.isExternalRewrite) {
          const origin = await originResolver.resolve(
            result.internalEvent.rawPath,
          );
          return {
            type: "middleware",
            internalEvent: {
              ...result.internalEvent,
              headers: {
                ...result.internalEvent.headers,
                [INTERNAL_HEADER_INITIAL_URL]: internalEvent.url,
                [INTERNAL_HEADER_RESOLVED_ROUTES]: JSON.stringify(
                  result.resolvedRoutes,
                ),
                [INTERNAL_EVENT_REQUEST_ID]: requestId,
                [INTERNAL_HEADER_REWRITE_STATUS_CODE]: String(
                  result.rewriteStatusCode,
                ),
              },
            },
            isExternalRewrite: result.isExternalRewrite,
            origin,
            isISR: result.isISR,
            initialURL: result.initialURL,
            resolvedRoutes: result.resolvedRoutes,
          };
        }
        try {
          return externalRequestProxy.proxy(result.internalEvent);
        } catch (e) {
          error("External request failed.", e);
          return {
            type: "middleware",
            internalEvent: {
              ...result.internalEvent,
              headers: {
                ...result.internalEvent.headers,
                [INTERNAL_EVENT_REQUEST_ID]: requestId,
              },
              rawPath: "/500",
              url: constructNextUrl(result.internalEvent.url, "/500"),
              method: "GET",
            },
            // On error we need to rewrite to the 500 page which is an internal rewrite
            isExternalRewrite: false,
            origin: false,
            isISR: result.isISR,
            initialURL: result.internalEvent.url,
            resolvedRoutes: [{ route: "/500", type: "page" }],
          };
        }
      }

      result.headers[INTERNAL_EVENT_REQUEST_ID] = requestId;
      debug("Middleware response", result);
      return result;
    },
  );
};

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "middleware",
});

export default {
  fetch: handler,
};
