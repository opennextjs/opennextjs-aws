import fs from "node:fs";
import path from "node:path";

import logger from "../logger.js";
import { openNextResolvePlugin } from "../plugins/resolve.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";

export async function createRevalidationBundle(
  options: buildHelper.BuildOptions,
) {
  logger.info(`Bundling revalidation function...`);

  const { appBuildOutputPath, config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "revalidation-function");
  fs.mkdirSync(outputPath, { recursive: true });

  //Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  // Build Lambda code
  await buildHelper.esbuildAsync(
    {
      external: ["next", "styled-jsx", "react"],
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "revalidate.js"),
      ],
      outfile: path.join(outputPath, "index.mjs"),
      plugins: [
        openNextResolvePlugin({
          fnName: "revalidate",
          overrides: {
            converter:
              config.revalidate?.override?.converter ?? "sqs-revalidate",
            wrapper: config.revalidate?.override?.wrapper,
          },
        }),
      ],
    },
    options,
  );

  installDependencies(outputPath, config.revalidate?.install);

  // Copy over .next/prerender-manifest.json file
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next", "prerender-manifest.json"),
    path.join(outputPath, "prerender-manifest.json"),
  );
}
