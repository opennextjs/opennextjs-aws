import url from "node:url";

import {
  buildNextjsApp,
  setStandaloneBuildMode,
} from "./build/buildNextApp.js";
import { compileCache } from "./build/compileCache.js";
import { compileOpenNextConfig } from "./build/compileConfig.js";
import { compileTagCacheProvider } from "./build/compileTagCacheProvider.js";
import { createCacheAssets, createStaticAssets } from "./build/createAssets.js";
import { createImageOptimizationBundle } from "./build/createImageOptimizationBundle.js";
import { createMiddleware } from "./build/createMiddleware.js";
import { createRevalidationBundle } from "./build/createRevalidationBundle.js";
import { createServerBundle } from "./build/createServerBundle.js";
import { createWarmerBundle } from "./build/createWarmerBundle.js";
import { generateOutput } from "./build/generateOutput.js";
import * as buildHelper from "./build/helper.js";
import { printHeader, showWarningOnWindows } from "./build/utils.js";
import logger from "./logger.js";

export type PublicFiles = {
  files: string[];
};

export async function build(
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  showWarningOnWindows();

  const baseDir = process.cwd();
  const openNextDistDir = url.fileURLToPath(new URL(".", import.meta.url));

  const { config, buildDir } = await compileOpenNextConfig(
    baseDir,
    openNextConfigPath,
    { nodeExternals },
  );

  // Initialize options
  const options = buildHelper.normalizeOptions(
    config,
    openNextDistDir,
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
  buildHelper.initOutputDir(options);
  buildNextjsApp(options);

  // Generate deployable bundle
  printHeader("Generating bundle");

  // Compile cache.ts
  compileCache(options);

  // Compile middleware
  await createMiddleware(options);

  createStaticAssets(options);

  if (config.dangerous?.disableIncrementalCache !== true) {
    const { useTagCache } = createCacheAssets(options);
    if (useTagCache) {
      await compileTagCacheProvider(options);
    }
  }

  await createServerBundle(options);
  await createRevalidationBundle(options);
  await createImageOptimizationBundle(options);
  await createWarmerBundle(options);
  await generateOutput(options);
  logger.info("OpenNext build complete.");
}
