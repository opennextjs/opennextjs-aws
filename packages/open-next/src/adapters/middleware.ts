import type { InternalEvent, Origin } from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";

import { debug } from "../adapters/logger";
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

const defaultHandler = async (internalEvent: InternalEvent) => {
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
        return externalRequestProxy.proxy(result.internalEvent);
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
