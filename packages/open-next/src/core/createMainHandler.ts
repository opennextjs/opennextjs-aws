import type { OpenNextConfig } from "types/open-next";

import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
import { openNextHandler } from "./requestHandler";
import {
  resolveAssetResolver,
  resolveCdnInvalidation,
  resolveConverter,
  resolveIncrementalCache,
  resolveProxyRequest,
  resolveQueue,
  resolveTagCache,
  resolveWrapper,
} from "./resolve";

export async function createMainHandler() {
  // @ts-expect-error `./open-next.config.mjs` exists only in the build output
  const config: OpenNextConfig = await import("./open-next.config.mjs").then(
    (m) => m.default,
  );

  const thisFunction = globalThis.fnName
    ? config.functions![globalThis.fnName]
    : config.default;

  globalThis.serverId = generateUniqueId();
  globalThis.openNextConfig = config;

  // If route preloading behavior is set to start, it will wait for every single route to be preloaded before even creating the main handler.
  await globalThis.__next_route_preloader("start");

  // Default queue
    const [queue, incrementalCache, tagCache, assetResolver, proxyExternalRequest, cdnInvalidationHandler] =
    await Promise.all([
      resolveQueue(thisFunction.override?.queue),
      resolveIncrementalCache(thisFunction.override?.incrementalCache),
      resolveTagCache(thisFunction.override?.tagCache),
      config.middleware?.external !== true
        ? resolveAssetResolver(globalThis.openNextConfig.middleware?.assetResolver)
        : Promise.resolve(undefined),
      resolveProxyRequest(thisFunction.override?.proxyExternalRequest),
      resolveCdnInvalidation(thisFunction.override?.cdnInvalidation),
    ]);

  globalThis.queue = queue;
  globalThis.incrementalCache = incrementalCache;
  globalThis.tagCache = tagCache;
  if (assetResolver !== undefined) {
    globalThis.assetResolver = assetResolver;
  }
  globalThis.proxyExternalRequest = proxyExternalRequest;
  globalThis.cdnInvalidationHandler = cdnInvalidationHandler;

  // From the config, we create the converter
  const converter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const { wrapper, name } = await resolveWrapper(
    thisFunction.override?.wrapper,
  );

  debug("Using wrapper", name);

  return wrapper(openNextHandler, converter);
}
