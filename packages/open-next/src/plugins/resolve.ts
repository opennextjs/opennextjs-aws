import { readFileSync } from "node:fs";

import { Plugin } from "esbuild";
import type {
  DefaultOverrideOptions,
  LazyLoadedOverride,
  OverrideOptions,
} from "types/open-next";

import logger from "../logger.js";

export interface IPluginSettings {
  overrides?: {
    wrapper?: DefaultOverrideOptions<any, any>["wrapper"];
    converter?: DefaultOverrideOptions<any, any>["converter"];
    tagCache?: OverrideOptions["tagCache"];
    queue?: OverrideOptions["queue"];
    incrementalCache?: OverrideOptions["incrementalCache"];
  };
  fnName?: string;
}

function getOverrideOrDefault<
  Override extends string | LazyLoadedOverride<any>,
>(override: Override, defaultOverride: string) {
  if (typeof override === "string") {
    return override;
  }
  return defaultOverride;
}

/**
 * @param opts.overrides - The name of the overrides to use
 * @returns
 */
export function openNextResolvePlugin({
  overrides,
  fnName,
}: IPluginSettings): Plugin {
  return {
    name: "opennext-resolve",
    setup(build) {
      logger.debug(`OpenNext Resolve plugin for ${fnName}`);
      build.onLoad({ filter: /core\/resolve.js/g }, async (args) => {
        let contents = readFileSync(args.path, "utf-8");
        if (overrides?.wrapper) {
          contents = contents.replace(
            "../wrappers/aws-lambda.js",
            `../wrappers/${getOverrideOrDefault(
              overrides.wrapper,
              "aws-lambda",
            )}.js`,
          );
        }
        if (overrides?.converter) {
          contents = contents.replace(
            "../converters/aws-apigw-v2.js",
            `../converters/${getOverrideOrDefault(
              overrides.converter,
              "dummy",
            )}.js`,
          );
        }
        if (overrides?.tagCache) {
          contents = contents.replace(
            "../cache/tag/dynamodb.js",
            `../cache/tag/${getOverrideOrDefault(
              overrides.tagCache,
              "dynamodb-lite",
            )}.js`,
          );
        }
        if (overrides?.queue) {
          contents = contents.replace(
            "../queue/sqs.js",
            `../queue/${getOverrideOrDefault(overrides.queue, "sqs-lite")}.js`,
          );
        }
        if (overrides?.incrementalCache) {
          contents = contents.replace(
            "../cache/incremental/s3.js",
            `../cache/incremental/${getOverrideOrDefault(
              overrides.incrementalCache,
              "s3-lite",
            )}.js`,
          );
        }
        return {
          contents,
        };
      });
    },
  };
}
