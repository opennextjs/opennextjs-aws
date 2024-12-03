import type {
  InternalEvent,
  InternalResult,
  MiddlewareResult,
} from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";

import { debug, error } from "../adapters/logger";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  resolveIncrementalCache,
  resolveOriginResolver,
  resolveProxyRequest,
  resolveQueue,
  resolveTagCache,
} from "../core/resolve";
import routingHandler from "../core/routingHandler";

globalThis.internalFetch = fetch;
globalThis.__openNextAls = new AsyncLocalStorage();

const defaultHandler = async (
  internalEvent: InternalEvent,
): Promise<InternalResult | MiddlewareResult> => {
  const originResolver = await resolveOriginResolver(
    globalThis.openNextConfig.middleware?.originResolver,
  );

  const externalRequestProxy = await resolveProxyRequest(
    globalThis.openNextConfig.middleware?.override?.proxyExternalRequest,
  );

  //#override includeCacheInMiddleware
  globalThis.tagCache = await resolveTagCache(
    globalThis.openNextConfig.middleware?.override?.tagCache,
  );

  globalThis.queue = await resolveQueue(
    globalThis.openNextConfig.middleware?.override?.queue,
  );

  globalThis.incrementalCache = await resolveIncrementalCache(
    globalThis.openNextConfig.middleware?.override?.incrementalCache,
  );
  //#endOverride

  // We run everything in the async local storage context so that it is available in the external middleware
  return runWithOpenNextRequestContext(
    { isISRRevalidation: internalEvent.headers["x-isr"] === "1" },
    async () => {
      const result = await routingHandler(internalEvent);
      if ("internalEvent" in result) {
        debug("Middleware intercepted event", internalEvent);
        if (!result.isExternalRewrite) {
          const origin = await originResolver.resolve(
            result.internalEvent.rawPath,
          );
          return {
            type: "middleware",
            internalEvent: result.internalEvent,
            isExternalRewrite: result.isExternalRewrite,
            origin,
            isISR: result.isISR,
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
              rawPath: "/500",
              url: "/500",
              method: "GET",
            },
            // On error we need to rewrite to the 500 page which is an internal rewrite
            isExternalRewrite: false,
            origin: false,
            isISR: result.isISR,
          };
        }
      }

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
