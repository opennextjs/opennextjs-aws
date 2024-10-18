import { readFileSync } from "node:fs";

import { Plugin } from "esbuild";
import type {
  DefaultOverrideOptions,
  ImageLoader,
  IncludedImageLoader,
  IncludedOriginResolver,
  LazyLoadedOverride,
  OriginResolver,
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
    imageLoader?: LazyLoadedOverride<ImageLoader> | IncludedImageLoader;
    originResolver?:
      | LazyLoadedOverride<OriginResolver>
      | IncludedOriginResolver;
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
      build.onLoad({ filter: /core(\/|\\)resolve\.js/g }, async (args) => {
        let contents = readFileSync(args.path, "utf-8");
        //TODO: refactor this. Every override should be at the same place so we can generate this dynamically
        if (overrides?.wrapper) {
          contents = contents.replace(
            "../overrides/wrappers/aws-lambda.js",
            `../overrides/wrappers/${getOverrideOrDefault(
              overrides.wrapper,
              "aws-lambda",
            )}.js`,
          );
        }
        if (overrides?.converter) {
          contents = contents.replace(
            "../overrides/converters/aws-apigw-v2.js",
            `../overrides/converters/${getOverrideOrDefault(
              overrides.converter,
              "dummy",
            )}.js`,
          );
        }
        if (overrides?.tagCache) {
          contents = contents.replace(
            "../overrides/tagCache/dynamodb.js",
            `../overrides/tagCache/${getOverrideOrDefault(
              overrides.tagCache,
              "dynamodb-lite",
            )}.js`,
          );
        }
        if (overrides?.queue) {
          contents = contents.replace(
            "../overrides/queue/sqs.js",
            `../overrides/queue/${getOverrideOrDefault(
              overrides.queue,
              "sqs-lite",
            )}.js`,
          );
        }
        if (overrides?.incrementalCache) {
          contents = contents.replace(
            "../overrides/incrementalCache/s3.js",
            `../overrides/incrementalCache/${getOverrideOrDefault(
              overrides.incrementalCache,
              "s3-lite",
            )}.js`,
          );
        }
        if (overrides?.imageLoader) {
          contents = contents.replace(
            "../overrides/imageLoader/s3.js",
            `../overrides/imageLoader/${getOverrideOrDefault(
              overrides.imageLoader,
              "s3",
            )}.js`,
          );
        }
        if (overrides?.originResolver) {
          contents = contents.replace(
            "../overrides/originResolver/pattern-env.js",
            `../overrides/originResolver/${getOverrideOrDefault(
              overrides.originResolver,
              "pattern-env",
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
