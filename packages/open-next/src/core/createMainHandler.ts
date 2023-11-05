import {
  BuildOptions,
  Converter,
  OverrideOptions,
  Wrapper,
} from "../adapters/types/open-next";
import { openNextHandler } from "./requestHandler";

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

export async function createMainHandler() {
  //First we load the config
  const config: BuildOptions = await import(
    process.cwd() + "/open-next.config.mjs"
  ).then((m) => m.default);

  // From the config, we create the adapter
  const adapter = await resolveConverter(
    config.functions.default.override?.converter,
  );

  // Then we create the handler
  const wrapper = await resolveWrapper(
    config.functions.default.override?.wrapper,
  );

  return wrapper(openNextHandler, adapter);
}
