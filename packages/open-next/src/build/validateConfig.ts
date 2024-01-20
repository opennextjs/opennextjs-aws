import {
  BuildOptions,
  FunctionOptions,
  SplittedFunctionOptions,
} from "types/open-next";

import logger from "../logger.js";

function validateFunctionOptions(fnOptions: FunctionOptions) {
  if (fnOptions.runtime === "edge" && fnOptions.experimentalBundledNextServer) {
    logger.warn(
      "experimentalBundledNextServer has no effect for edge functions",
    );
  }
  if (
    fnOptions.override?.generateDockerfile &&
    fnOptions.override.converter !== "node" &&
    fnOptions.override.wrapper !== "node"
  ) {
    logger.warn(
      "You've specified generateDockerfile without node converter and wrapper. Without custom converter and wrapper the dockerfile will not work",
    );
  }
}

function validateSplittedFunctionOptions(
  fnOptions: SplittedFunctionOptions,
  name: string,
) {
  validateFunctionOptions(fnOptions);
  if (fnOptions.routes.length === 0) {
    throw new Error(`Splitted function ${name} must have at least one route`);
  }
  if (fnOptions.runtime === "edge" && fnOptions.routes.length > 1) {
    throw new Error(`Edge function ${name} can only have one route`);
  }
}

export function validateConfig(config: BuildOptions) {
  validateFunctionOptions(config.default);
  Object.entries(config.functions ?? {}).forEach(([name, fnOptions]) => {
    validateSplittedFunctionOptions(fnOptions, name);
  });
  if (config.dangerous?.disableIncrementalCache) {
    logger.warn(
      "You've disabled incremental cache. This means that ISR and SSG will not work.",
    );
  }
  if (config.dangerous?.disableTagCache) {
    logger.warn(
      `You've disabled tag cache. 
       This means that revalidatePath and revalidateTag from next/cache will not work.
       It is safe to disable if you only use page router`,
    );
  }
}
