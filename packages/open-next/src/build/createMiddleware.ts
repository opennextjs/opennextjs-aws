import fs from "node:fs";
import path from "node:path";

import logger from "../logger.js";
import { type MiddlewareManifest } from "../types/next-types.js";
import { buildEdgeBundle } from "./edge/createEdgeBundle.js";
import * as buildHelper from "./helper.js";

export async function createMiddleware(options: buildHelper.BuildOptions) {
  logger.info(`Bundling middleware function...`);

  const { appBuildOutputPath, config, outputDir } = options;

  // Get middleware manifest
  const middlewareManifest = JSON.parse(
    fs.readFileSync(
      path.join(appBuildOutputPath, ".next/server/middleware-manifest.json"),
      "utf8",
    ),
  ) as MiddlewareManifest;

  const entry = middlewareManifest.middleware["/"];
  if (!entry) {
    return;
  }

  // Create output folder
  let outputPath = path.join(outputDir, "server-function");

  const commonMiddlewareOptions = {
    middlewareInfo: entry,
    options,
    appBuildOutputPath,
  };

  if (config.middleware?.external) {
    outputPath = path.join(outputDir, "middleware");
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
        options.openNextSourceDir,
        "adapters",
        "middleware.js",
      ),
      outfile: path.join(outputPath, "handler.mjs"),
      ...commonMiddlewareOptions,
      overrides: config.middleware?.override,
      defaultConverter: "aws-cloudfront",
      includeCache: config.dangerous?.enableCacheInterception,
      additionalExternals: config.edgeExternals,
    });
  } else {
    await buildEdgeBundle({
      entrypoint: path.join(
        options.openNextSourceDir,
        "core",
        "edgeFunctionHandler.js",
      ),
      outfile: path.join(options.buildDir, "middleware.mjs"),
      ...commonMiddlewareOptions,
      onlyBuildOnce: true,
    });
  }
}
