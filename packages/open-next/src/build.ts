import fs from "node:fs";
import path from "node:path";

import {
  buildNextjsApp,
  setStandaloneBuildMode,
} from "./build/buildNextApp.js";
import { compileCache } from "./build/compileCache.js";
import { compileOpenNextConfig } from "./build/compileConfig.js";
import { createCacheAssets, createStaticAssets } from "./build/createAssets.js";
import { createImageOptimizationBundle } from "./build/createImageOptimizationBundle.js";
import { createMiddleware } from "./build/createMiddleware.js";
import { createRevalidationBundle } from "./build/createRevalidationBundle.js";
import { createServerBundle } from "./build/createServerBundle.js";
import { generateOutput } from "./build/generateOutput.js";
import * as buildHelper from "./build/helper.js";
import { printHeader } from "./build/utils.js";
import logger from "./logger.js";
import { openNextResolvePlugin } from "./plugins/resolve.js";

export type PublicFiles = {
  files: string[];
};

export async function build(
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  buildHelper.showWarningOnWindows();

  const baseDir = process.cwd();

  const { config, buildDir } = await compileOpenNextConfig(
    baseDir,
    openNextConfigPath,
    nodeExternals,
  );

  // Initialize options
  const options = buildHelper.normalizeOptions(
    config,
    import.meta.url,
    buildDir,
  );
  logger.setLevel(options.debug ? "debug" : "info");

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  buildHelper.printNextjsVersion(options);
  buildHelper.printOpenNextVersion(options);

  // Build Next.js app
  printHeader("Building Next.js app");
  setStandaloneBuildMode(options);
  buildNextjsApp(options);

  // Generate deployable bundle
  printHeader("Generating bundle");
  buildHelper.initOutputDir(options);

  // Compile cache.ts
  compileCache(options);

  // Compile middleware
  await createMiddleware(options);

  createStaticAssets(options);
  await createCacheAssets(options);

  await createServerBundle(options);
  await createRevalidationBundle(options);
  await createImageOptimizationBundle(options);
  await createWarmerBundle(options);
  await generateOutput(options);
  logger.info("OpenNext build complete.");
}

async function createWarmerBundle(options: buildHelper.BuildOptions) {
  logger.info(`Bundling warmer function...`);

  const { config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "warmer-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adatper relys on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "warmer-function.js"),
      ],
      external: ["next"],
      outfile: path.join(outputPath, "index.mjs"),
      plugins: [
        openNextResolvePlugin({
          overrides: {
            converter: config.warmer?.override?.converter ?? "dummy",
            wrapper: config.warmer?.override?.wrapper,
          },
          fnName: "warmer",
        }),
      ],
      banner: {
        js: [
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join(""),
      },
    },
    options,
  );
}
