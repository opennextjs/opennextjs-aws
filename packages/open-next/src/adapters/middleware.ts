import { InternalEvent, Origin } from "types/open-next";

import { debug } from "../adapters/logger";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  resolveIncrementalCache,
  resolveOriginResolver,
  resolveQueue,
  resolveTagCache,
} from "../core/resolve";
import routingHandler from "../core/routingHandler";

globalThis.internalFetch = fetch;

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

  const result = await routingHandler(internalEvent);
  if ("internalEvent" in result) {
    debug("Middleware intercepted event", internalEvent);
    let origin: Origin | false = false;
    if (!result.isExternalRewrite) {
      origin = await originResolver.resolve(result.internalEvent.rawPath);
    }
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
};

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "middleware",
});

export default {
  fetch: handler,
};
