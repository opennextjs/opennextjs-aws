import {
  BuildOptions,
  Converter,
  OverrideOptions,
  Wrapper,
} from "../adapters/types/open-next";
import type { IncrementalCache } from "../cache/incremental/types";
import type { Queue } from "../queue/types";
import { openNextHandler } from "./requestHandler";

declare global {
  var queue: Queue;
  var incrementalCache: IncrementalCache;
}

async function resolveConverter(
  converter: OverrideOptions["converter"],
): Promise<Converter> {
  if (typeof converter === "string") {
    const m = await import(`../converters/${converter}.js`);
    return m.default;
  } else if (typeof converter === "function") {
    return converter();
  } else {
    const m_1 = await import("../converters/aws-apigw-v2.js");
    return m_1.default;
  }
}

async function resolveWrapper(
  wrapper: OverrideOptions["wrapper"],
): Promise<Wrapper> {
  if (typeof wrapper === "string") {
    const m = await import(`../wrappers/${wrapper}.js`);
    return m.default;
  } else if (typeof wrapper === "function") {
    return wrapper();
  } else {
    const m_1 = await import("../wrappers/aws-lambda.js");
    return m_1.default;
  }
}

async function resolveQueue(queue: OverrideOptions["queue"]) {
  if (typeof queue === "string") {
    const m = await import(`../queue/${queue}.js`);
    return m.default;
  } else if (typeof queue === "function") {
    return queue();
  } else {
    const m_1 = await import("../queue/sqs.js");
    return m_1.default;
  }
}

async function resolveIncrementalCache(
  incrementalCache: OverrideOptions["incrementalCache"],
) {
  if (typeof incrementalCache === "string") {
    const m = await import(`../cache/incremental/${incrementalCache}.js`);
    return m.default;
  } else if (typeof incrementalCache === "function") {
    return incrementalCache();
  } else {
    const m_1 = await import("../cache/incremental/s3.js");
    return m_1.default;
  }
}

export async function createMainHandler() {
  //First we load the config
  const config: BuildOptions = await import(
    process.cwd() + "/open-next.config.js"
  ).then((m) => m.default);

  const thisFunction = config.functions.default;

  // Default queue
  globalThis.queue = await resolveQueue(thisFunction.override?.queue);

  globalThis.incrementalCache = await resolveIncrementalCache(
    thisFunction.override?.incrementalCache,
  );

  // From the config, we create the adapter
  const adapter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const wrapper = await resolveWrapper(thisFunction.override?.wrapper);

  return wrapper(openNextHandler, adapter);
}
