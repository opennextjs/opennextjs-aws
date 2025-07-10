import type {
  BaseEventOrResult,
  DefaultOverrideOptions,
  InternalEvent,
  InternalResult,
  OpenNextConfig,
} from "types/open-next";
import type { OpenNextHandler } from "types/overrides";

import { debug } from "../adapters/logger";
import { resolveConverter, resolveWrapper } from "./resolve";

type HandlerType =
  | "imageOptimization"
  | "revalidate"
  | "warmer"
  | "middleware"
  | "initializationFunction";

type GenericHandler<
  Type extends HandlerType,
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = {
  handler: OpenNextHandler<E, R>;
  type: Type;
};

export async function createGenericHandler<
  Type extends HandlerType,
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(handler: GenericHandler<Type, E, R>) {
  // @ts-expect-error `./open-next.config.mjs` exists only in the build output
  const config: OpenNextConfig = await import("./open-next.config.mjs").then(
    (m) => m.default,
  );

  globalThis.openNextConfig = config;
  const handlerConfig = config[handler.type];
  const override =
    handlerConfig && "override" in handlerConfig
      ? (handlerConfig.override as any as DefaultOverrideOptions<E, R>)
      : undefined;

  // From the config, we create the converter
  const converter = await resolveConverter<E, R>(override?.converter);

  // Then we create the handler
  const { name, wrapper } = await resolveWrapper<E, R>(override?.wrapper);
  debug("Using wrapper", name);

  return wrapper(handler.handler, converter);
}
