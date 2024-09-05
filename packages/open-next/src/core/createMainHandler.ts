import type { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextConfig } from "types/open-next";
import { DetachedPromiseRunner } from "utils/promise";

import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
import type { IncrementalCache } from "../cache/incremental/types";
import type { Queue } from "../queue/types";
import { openNextHandler } from "./requestHandler.js";
import {
  resolveConverter,
  resolveIncrementalCache,
  resolveQueue,
  resolveTagCache,
  resolveWrapper,
} from "./resolve";

declare global {
  var queue: Queue;
  var incrementalCache: IncrementalCache;
  var fnName: string | undefined;
  var serverId: string;
  var __als: AsyncLocalStorage<{
    requestId: string;
    pendingPromiseRunner: DetachedPromiseRunner;
    isISRRevalidation?: boolean;
  }>;
}

export async function createMainHandler() {
  //First we load the config
  const config: OpenNextConfig = await import(
    process.cwd() + "/open-next.config.mjs"
  ).then((m) => m.default);

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

  globalThis.lastModified = {};

  // From the config, we create the adapter
  const adapter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const wrapper = await resolveWrapper(thisFunction.override?.wrapper);

  debug("Using wrapper", wrapper.name);

  return wrapper.wrapper(openNextHandler, adapter);
}
