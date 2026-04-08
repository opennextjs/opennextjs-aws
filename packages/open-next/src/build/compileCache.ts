import path from "node:path";

import * as buildHelper from "./helper.js";

/**
 * Compiles the cache adapter.
 *
 * @param options Build options.
 * @param format Output format.
 * @returns An object containing the paths to the compiled cache and composable cache files.
 */
export function compileCache(
  options: buildHelper.BuildOptions,
  format: "cjs" | "esm" = "cjs",
) {
  const { config } = options;
  const ext = format === "cjs" ? "cjs" : "mjs";
  const compiledCacheFile = path.join(options.buildDir, `cache.${ext}`);

  // Normal cache
  buildHelper.esbuildSync(
    {
      external: ["next", "styled-jsx", "react", "@aws-sdk/*"],
      entryPoints: [path.join(options.openNextDistDir, "adapters", "cache.js")],
      outfile: compiledCacheFile,
      target: ["node18"],
      format,
      banner: {
        js: [
          `globalThis.disableIncrementalCache = ${
            config.dangerous?.disableIncrementalCache ?? false
          };`,
          `globalThis.disableDynamoDBCache = ${
            config.dangerous?.disableTagCache ?? false
          };`,
          `globalThis.nextVersion = "${options.nextVersion}";`,
        ].join(""),
      },
    },
    options,
  );

  const compiledComposableCacheFile = path.join(
    options.buildDir,
    `composable-cache.${ext}`,
  );

  // Composable cache
  buildHelper.esbuildSync(
    {
      external: ["next", "styled-jsx", "react", "@aws-sdk/*"],
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "composable-cache.js"),
      ],
      outfile: compiledComposableCacheFile,
      target: ["node18"],
      format,
      banner: {
        js: [
          `globalThis.disableIncrementalCache = ${
            config.dangerous?.disableIncrementalCache ?? false
          };`,
          `globalThis.disableDynamoDBCache = ${
            config.dangerous?.disableTagCache ?? false
          };`,
          `globalThis.nextVersion = "${options.nextVersion}";`,
        ].join(""),
      },
    },
    options,
  );

  return {
    cache: compiledCacheFile,
    composableCache: compiledComposableCacheFile,
  };
}
