import fs from "node:fs";
import path from "node:path";

import {
  loadFunctionsConfigManifest,
  loadMiddlewareManifest,
} from "config/util.js";
import logger from "../logger.js";
import type { MiddlewareInfo } from "../types/next-types.js";
import {
  buildEdgeBundle,
  copyMiddlewareResources,
} from "./edge/createEdgeBundle.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";
import {
  buildBundledNodeMiddleware,
  buildExternalNodeMiddleware,
} from "./middleware/buildNodeMiddleware.js";

/**
 * Compiles the middleware bundle.
 *
 * @param options Build Options.
 * @param forceOnlyBuildOnce force to build only once.
 */
export async function createMiddleware(
  options: buildHelper.BuildOptions,
  { forceOnlyBuildOnce = false } = {},
) {
  logger.info("Bundling middleware function...");

  const { config, outputDir } = options;
  const buildOutputDotNextDir = path.join(
    options.appBuildOutputPath,
    options.nextDistDir,
  );

  // Get middleware manifest
  const middlewareManifest = loadMiddlewareManifest(buildOutputDotNextDir);

  const edgeMiddlewareInfo = middlewareManifest.middleware["/"] as
    | MiddlewareInfo
    | undefined;

  if (!edgeMiddlewareInfo) {
    // If there is no middleware info, it might be a node middleware
    const functionsConfigManifest = loadFunctionsConfigManifest(
      buildOutputDotNextDir,
    );

    if (functionsConfigManifest?.functions["/_middleware"]) {
      await (config.middleware?.external
        ? buildExternalNodeMiddleware(options)
        : buildBundledNodeMiddleware(options));
      return;
    }
  }

  if (config.middleware?.external) {
    const outputPath = path.join(outputDir, "middleware");
    copyMiddlewareResources(options, edgeMiddlewareInfo, outputPath);

    fs.mkdirSync(outputPath, { recursive: true });

    // Copy open-next.config.mjs
    buildHelper.copyOpenNextConfig(
      options.buildDir,
      outputPath,
      await buildHelper.isEdgeRuntime(config.middleware.override),
    );

    // Bundle middleware
    await buildEdgeBundle({
      entrypoint: path.join(
        options.openNextDistDir,
        "adapters",
        "middleware.js",
      ),
      outfile: path.join(outputPath, "handler.mjs"),
      middlewareInfo: edgeMiddlewareInfo,
      options,
      overrides: {
        ...config.middleware.override,
        originResolver: config.middleware.originResolver,
      },
      defaultConverter: "aws-cloudfront",
      includeCache: config.dangerous?.enableCacheInterception,
      additionalExternals: config.edgeExternals,
      onlyBuildOnce: forceOnlyBuildOnce === true,
      name: "middleware",
    });

    installDependencies(outputPath, config.middleware?.install);
  } else {
    await buildEdgeBundle({
      entrypoint: path.join(
        options.openNextDistDir,
        "core",
        "edgeFunctionHandler.js",
      ),
      outfile: path.join(options.buildDir, "middleware.mjs"),
      middlewareInfo: edgeMiddlewareInfo,
      options,
      overrides: config.default.override,
      onlyBuildOnce: true,
      name: "middleware",
    });
  }
}
