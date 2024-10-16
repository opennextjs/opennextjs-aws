import path from "node:path";

import * as buildHelper from "./helper.js";

/**
 * Compiles the cache adapter.
 *
 * @param options Build options.
 * @param format Output format.
 * @returns The path to the compiled file.
 */
export function compileCache(
  options: buildHelper.BuildOptions,
  format: "cjs" | "esm" = "cjs",
) {
  const { config } = options;
  const ext = format === "cjs" ? "cjs" : "mjs";
  const outFile = path.join(options.buildDir, `cache.${ext}`);

  const isAfter15 =
    buildHelper.compareSemver(options.nextVersion, "15.0.0") >= 0;

  buildHelper.esbuildSync(
    {
      external: ["next", "styled-jsx", "react", "@aws-sdk/*"],
      entryPoints: [
        path.join(options.openNextSourceDir, "adapters", "cache.js"),
      ],
      outfile: outFile,
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
          `globalThis.isNextAfter15 = ${isAfter15};`,
        ].join(""),
      },
    },
    options,
  );
  return outFile;
}
