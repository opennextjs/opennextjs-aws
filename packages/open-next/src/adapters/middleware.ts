import type { InternalEvent, Origin } from "types/open-next";
import { awaitAllDetachedPromise } from "utils/promise";

import { debug } from "../adapters/logger";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  resolveIncrementalCache,
  resolveOriginResolver,
  resolveQueue,
  resolveTagCache,
} from "../core/resolve";
import routingHandler from "../core/routingHandler";
import { generateOpenNextRequestContext } from "./util";

globalThis.internalFetch = fetch;
globalThis.__als = new AsyncLocalStorage();

const defaultHandler = async (internalEvent: InternalEvent) => {
  const originResolver = await resolveOriginResolver(
    globalThis.openNextConfig.middleware?.originResolver,
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

  const { requestId, pendingPromiseRunner, isISRRevalidation } =
    generateOpenNextRequestContext(internalEvent.headers["x-isr"] === "1");

  // We run everything in the async local storage context so that it is available in the external middleware
  return globalThis.__als.run(
    {
      requestId,
      pendingPromiseRunner,
      isISRRevalidation,
    },
    async () => {
      const result = await routingHandler(internalEvent);
      if ("internalEvent" in result) {
        debug("Middleware intercepted event", internalEvent);
        let origin: Origin | false = false;
        if (!result.isExternalRewrite) {
          origin = await originResolver.resolve(result.internalEvent.rawPath);
        }
        await awaitAllDetachedPromise();
        return {
          type: "middleware",
          internalEvent: result.internalEvent,
          isExternalRewrite: result.isExternalRewrite,
          origin,
          isISR: result.isISR,
        };
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
