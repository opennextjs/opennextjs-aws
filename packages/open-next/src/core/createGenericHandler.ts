import type {
  BaseEventOrResult,
  DefaultOverrideOptions,
  InternalEvent,
  InternalResult,
  OpenNextConfig,
  OpenNextHandler,
} from "types/open-next";

import { debug } from "../adapters/logger";
import { resolveConverter, resolveWrapper } from "./resolve";

declare global {
  var openNextConfig: Partial<OpenNextConfig>;
}

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
  //First we load the config
  // @ts-expect-error
  const config: OpenNextConfig = await import("./open-next.config.mjs").then(
    (m) => m.default,
  );

  globalThis.openNextConfig = config;
  const override = config[handler.type]
    ?.override as any as DefaultOverrideOptions<E, R>;

  // From the config, we create the converter
  const converter = await resolveConverter<E, R>(override?.converter);

  // Then we create the handler
  const { name, wrapper } = await resolveWrapper<E, R>(override?.wrapper);
  debug("Using wrapper", name);

  return wrapper(handler.handler, converter);
}
