import { readFileSync } from "node:fs";

import chalk from "chalk";
import type { Plugin } from "esbuild";
import type {
  IncludedImageLoader,
  IncludedOriginResolver,
  IncludedWarmer,
  LazyLoadedOverride,
  OverrideOptions,
} from "types/open-next";
import type { ImageLoader, OriginResolver, Warmer } from "types/overrides";

import logger from "../logger.js";

export interface IPluginSettings {
  overrides?: {
    wrapper?: OverrideOptions["wrapper"];
    converter?: OverrideOptions["converter"];
    tagCache?: OverrideOptions["tagCache"];
    queue?: OverrideOptions["queue"];
    incrementalCache?: OverrideOptions["incrementalCache"];
    imageLoader?: LazyLoadedOverride<ImageLoader> | IncludedImageLoader;
    originResolver?:
      | LazyLoadedOverride<OriginResolver>
      | IncludedOriginResolver;
    warmer?: LazyLoadedOverride<Warmer> | IncludedWarmer;
    proxyExternalRequest?: OverrideOptions["proxyExternalRequest"];
  };
  fnName?: string;
}

function getOverrideOrDummy<Override extends string | LazyLoadedOverride<any>>(
  override: Override,
) {
  if (typeof override === "string") {
    return override;
  }
  // We can return dummy here because if it's not a string, it's a LazyLoadedOverride
  return "dummy";
}

// This could be useful in the future to map overrides to nested folders
const nameToFolder = {
  wrapper: "wrappers",
  converter: "converters",
  tagCache: "tagCache",
  queue: "queue",
  incrementalCache: "incrementalCache",
  imageLoader: "imageLoader",
  originResolver: "originResolver",
  warmer: "warmer",
  proxyExternalRequest: "proxyExternalRequest",
};

const defaultOverrides = {
  wrapper: "aws-lambda",
  converter: "aws-apigw-v2",
  tagCache: "dynamodb",
  queue: "sqs",
  incrementalCache: "s3",
  imageLoader: "s3",
  originResolver: "pattern-env",
  warmer: "aws-lambda",
  proxyExternalRequest: "node",
};

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
      logger.debug(
        chalk.blue("OpenNext Resolve plugin"),
        fnName ? `for ${fnName}` : "",
      );
      build.onLoad({ filter: /core(\/|\\)resolve\.js/g }, async (args) => {
        let contents = readFileSync(args.path, "utf-8");
        const overridesEntries = Object.entries(overrides ?? {});
        for (const [overrideName, overrideValue] of overridesEntries) {
          if (!overrideValue) {
            continue;
          }
          const folder =
            nameToFolder[overrideName as keyof typeof nameToFolder];
          const defaultOverride =
            defaultOverrides[overrideName as keyof typeof defaultOverrides];
          contents = contents.replace(
            `../overrides/${folder}/${defaultOverride}.js`,
            `../overrides/${folder}/${getOverrideOrDummy(overrideValue)}.js`,
          );
        }
        return {
          contents,
        };
      });
    },
  };
}
