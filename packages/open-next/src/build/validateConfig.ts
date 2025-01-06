import type {
  FunctionOptions,
  IncludedConverter,
  IncludedWrapper,
  OpenNextConfig,
  SplittedFunctionOptions,
} from "types/open-next";

import logger from "../logger.js";

const compatibilityMatrix: Record<IncludedWrapper, IncludedConverter[]> = {
  "aws-lambda": [
    "aws-apigw-v1",
    "aws-apigw-v2",
    "aws-cloudfront",
    "sqs-revalidate",
  ],
  "aws-lambda-streaming": ["aws-apigw-v2"],
  cloudflare: ["edge"],
  "cloudflare-edge": ["edge"],
  "cloudflare-node": ["edge"],
  node: ["node"],
  "express-dev": ["node"],
  dummy: ["dummy"],
};

function validateFunctionOptions(fnOptions: FunctionOptions) {
  if (fnOptions.runtime === "edge" && fnOptions.experimentalBundledNextServer) {
    logger.warn(
      "experimentalBundledNextServer has no effect for edge functions",
    );
  }
  const wrapper =
    typeof fnOptions.override?.wrapper === "string"
      ? fnOptions.override.wrapper
      : "aws-lambda";
  const converter =
    typeof fnOptions.override?.converter === "string"
      ? fnOptions.override.converter
      : "aws-apigw-v2";
  if (
    fnOptions.override?.generateDockerfile &&
    converter !== "node" &&
    wrapper !== "node"
  ) {
    logger.warn(
      "You've specified generateDockerfile without node converter and wrapper. Without custom converter and wrapper the dockerfile will not work",
    );
  }
  if (converter === "aws-cloudfront" && fnOptions.placement !== "global") {
    logger.warn(
      "You've specified aws-cloudfront converter without global placement. This may not generate the correct output",
    );
  }
  const isCustomWrapper = typeof fnOptions.override?.wrapper === "function";
  const isCustomConverter = typeof fnOptions.override?.converter === "function";
  // Check if the wrapper and converter are compatible
  // Only check if using one of the included converters or wrapper
  if (
    !compatibilityMatrix[wrapper].includes(converter) &&
    !isCustomWrapper &&
    !isCustomConverter
  ) {
    logger.error(
      `Wrapper ${wrapper} and converter ${converter} are not compatible. For the wrapper ${wrapper} you should only use the following converters: ${compatibilityMatrix[
        wrapper
      ].join(", ")}`,
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
  // Check if the routes are properly formated
  fnOptions.routes.forEach((route) => {
    if (!route.startsWith("app/") && !route.startsWith("pages/")) {
      throw new Error(
        `Route ${route} in function ${name} is not a valid route. It should starts with app/ or pages/ depending on if you use page or app router`,
      );
    }
  });
  if (fnOptions.runtime === "edge" && fnOptions.routes.length > 1) {
    throw new Error(`Edge function ${name} can only have one route`);
  }
}

export function validateConfig(config: OpenNextConfig) {
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
  validateFunctionOptions(config.imageOptimization ?? {});
  validateFunctionOptions(config.middleware ?? {});
  //@ts-expect-error - Revalidate custom wrapper type is different
  validateFunctionOptions(config.revalidate ?? {});
  //@ts-expect-error - Warmer custom wrapper type is different
  validateFunctionOptions(config.warmer ?? {});
  validateFunctionOptions(config.initializationFunction ?? {});
}
