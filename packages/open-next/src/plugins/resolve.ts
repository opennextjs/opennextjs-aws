import { readFileSync } from "node:fs";

import { Plugin } from "esbuild";
import type {
  DefaultOverrideOptions,
  IncludedIncrementalCache,
  IncludedQueue,
  IncludedTagCache,
} from "types/open-next";

import logger from "../logger.js";

export interface IPluginSettings {
  overrides?: {
    wrapper?: DefaultOverrideOptions<any, any>["wrapper"];
    converter?: DefaultOverrideOptions<any, any>["converter"];
    // Right now theses do nothing since there is only one implementation
    tag?: IncludedTagCache;
    queue?: IncludedQueue;
    incrementalCache?: IncludedIncrementalCache;
  };
  fnName?: string;
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
        if (overrides?.wrapper && typeof overrides.wrapper === "string") {
          contents = contents.replace(
            "../wrappers/aws-lambda.js",
            `../wrappers/${overrides.wrapper}.js`,
          );
        }
        if (overrides?.converter) {
          if (typeof overrides.converter === "function") {
            contents = contents.replace(
              "../converters/aws-apigw-v2.js",
              `../converters/dummy.js`,
            );
          } else {
            contents = contents.replace(
              "../converters/aws-apigw-v2.js",
              `../converters/${overrides.converter}.js`,
            );
          }
        }
        if (overrides?.tag) {
          contents = contents.replace(
            "../cache/tag/dynamodb.js",
            `../cache/tag/${overrides.tag}.js`,
          );
        }
        return {
          contents,
        };
      });
    },
  };
}
