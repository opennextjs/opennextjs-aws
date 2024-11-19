import type { OpenNextConfig } from "types/open-next";

import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
import { openNextHandler } from "./requestHandler";
import {
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

  // Default queue
  globalThis.queue = await resolveQueue(thisFunction.override?.queue);

  globalThis.incrementalCache = await resolveIncrementalCache(
    thisFunction.override?.incrementalCache,
  );

  globalThis.tagCache = await resolveTagCache(thisFunction.override?.tagCache);

  globalThis.proxyExternalRequest = await resolveProxyRequest(
    thisFunction.override?.proxyExternalRequest,
  );

  globalThis.lastModified = {};

  // From the config, we create the converter
  const converter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const { wrapper, name } = await resolveWrapper(
    thisFunction.override?.wrapper,
  );

  debug("Using wrapper", name);

  return wrapper(openNextHandler, converter);
}
