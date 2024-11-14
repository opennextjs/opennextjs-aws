import fs from "node:fs";
import path from "node:path";

import logger from "../logger.js";
import type {
  MiddlewareInfo,
  MiddlewareManifest,
} from "../types/next-types.js";
import { buildEdgeBundle } from "./edge/createEdgeBundle.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";

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

  const { appBuildOutputPath, config, outputDir } = options;

  // Get middleware manifest
  const middlewareManifest = JSON.parse(
    fs.readFileSync(
      path.join(appBuildOutputPath, ".next/server/middleware-manifest.json"),
      "utf8",
    ),
  ) as MiddlewareManifest;

  const middlewareInfo = middlewareManifest.middleware["/"] as
    | MiddlewareInfo
    | undefined;

  if (config.middleware?.external) {
    const outputPath = path.join(outputDir, "middleware");
    fs.mkdirSync(outputPath, { recursive: true });

    // Copy open-next.config.mjs
    buildHelper.copyOpenNextConfig(
      options.buildDir,
      outputPath,
      config.middleware.override?.wrapper === "cloudflare",
    );

    // Bundle middleware
    await buildEdgeBundle({
      entrypoint: path.join(
        options.openNextDistDir,
        "adapters",
        "middleware.js",
      ),
      outfile: path.join(outputPath, "handler.mjs"),
      middlewareInfo,
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
      middlewareInfo,
      options,
      onlyBuildOnce: true,
      name: "middleware",
    });
  }
}
