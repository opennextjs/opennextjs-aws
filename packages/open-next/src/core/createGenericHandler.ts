import type {
  BaseEventOrResult,
  BuildOptions,
  DefaultOverrideOptions,
  InternalEvent,
  InternalResult,
  OpenNextHandler,
} from "types/open-next";

import { resolveConverter, resolveWrapper } from "./resolve";

declare global {
  var openNextConfig: Partial<BuildOptions>;
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
  defaultConverter?: string;
};

export async function createGenericHandler<
  Type extends HandlerType,
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(handler: GenericHandler<Type, E, R>) {
  //First we load the config
  const config: BuildOptions = await import(
    process.cwd() + "/open-next.config.js"
  ).then((m) => m.default);

  globalThis.openNextConfig = {
    [handler.type]: config[handler.type],
  };
  const override = config[handler.type]
    ?.override as any as DefaultOverrideOptions<E, R>;

  // From the config, we create the adapter
  const adapter = await resolveConverter<E, R>(
    override?.converter,
    handler.defaultConverter,
  );

  // Then we create the handler
  const wrapper = await resolveWrapper<E, R>(override?.wrapper);

  return wrapper(handler.handler, adapter);
}
