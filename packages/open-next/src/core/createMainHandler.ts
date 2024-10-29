import type { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextConfig } from "types/open-next";
import type { DetachedPromiseRunner } from "utils/promise";

import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
import type { IncrementalCache } from "../overrides/incrementalCache/types";
import type { Queue } from "../overrides/queue/types";
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
    mergeHeadersPriority?: "middleware" | "handler";
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

  // From the config, we create the converter
  const converter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const { wrapper, name } = await resolveWrapper(
    thisFunction.override?.wrapper,
  );

  debug("Using wrapper", name);

  return wrapper(openNextHandler, converter);
}
