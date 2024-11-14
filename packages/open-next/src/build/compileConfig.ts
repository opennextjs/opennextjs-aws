import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSync } from "esbuild";
import type { OpenNextConfig } from "types/open-next.js";

import logger from "../logger.js";
import { validateConfig } from "./validateConfig.js";

/**
 * Compiles the OpenNext configuration.
 *
 * The configuration is always compiled for Node.js and for the edge only if needed.
 *
 * @param baseDir Directory where to look for the configuration.
 * @param openNextConfigPath Override the default configuration when provided. Relative to baseDir.
 * @param nodeExternals Externals for the Node.js compilation.
 * @return The configuration and the build directory.
 */
export async function compileOpenNextConfig(
  baseDir: string,
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  const sourcePath = path.join(
    baseDir,
    openNextConfigPath ?? "open-next.config.ts",
  );

  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-next-tmp"));
  let configPath = compileOpenNextConfigNode(
    sourcePath,
    buildDir,
    nodeExternals ? nodeExternals.split(",") : [],
  );

  // On Windows, we need to use file:// protocol to load the config file using import()
  if (process.platform === "win32") configPath = `file://${configPath}`;
  const config = (await import(configPath)).default as OpenNextConfig;
  if (!config || !config.default) {
    logger.error(
      "config.default cannot be empty, it should be at least {}, see more info here: https://opennext.js.org/config#configuration-file",
    );
    process.exit(1);
  }

  validateConfig(config);

  // We need to check if the config uses the edge runtime at any point
  // If it does, we need to compile it with the edge runtime
  const usesEdgeRuntime =
    config.middleware?.external ||
    Object.values(config.functions || {}).some((fn) => fn.runtime === "edge");
  if (!usesEdgeRuntime) {
    logger.debug(
      "No edge runtime found in the open-next.config.ts. Using default config.",
    );
    //Nothing to do here
  } else {
    compileOpenNextConfigEdge(sourcePath, buildDir, config.edgeExternals ?? []);
  }

  return { config, buildDir };
}

export function compileOpenNextConfigNode(
  sourcePath: string,
  outputDir: string,
  externals: string[],
) {
  const outputPath = path.join(outputDir, "open-next.config.mjs");
  logger.debug("Compiling open-next.config.ts for Node.", outputPath);

  //Check if open-next.config.ts exists
  if (!fs.existsSync(sourcePath)) {
    //Create a simple open-next.config.mjs file
    logger.debug("Cannot find open-next.config.ts. Using default config.");
    fs.writeFileSync(outputPath, "export default { default: { } };");
  } else {
    buildSync({
      entryPoints: [sourcePath],
      outfile: outputPath,
      bundle: true,
      format: "esm",
      target: ["node18"],
      external: externals,
      platform: "node",
      banner: {
        js: [
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join(""),
      },
    });
  }

  return outputPath;
}

export function compileOpenNextConfigEdge(
  sourcePath: string,
  outputDir: string,
  externals: string[],
) {
  const outputPath = path.join(outputDir, "open-next.config.edge.mjs");
  logger.debug("Compiling open-next.config.ts for edge runtime.", outputPath);

  buildSync({
    entryPoints: [sourcePath],
    outfile: outputPath,
    bundle: true,
    format: "esm",
    target: ["es2020"],
    conditions: ["worker", "browser"],
    platform: "browser",
    external: externals,
  });
}
