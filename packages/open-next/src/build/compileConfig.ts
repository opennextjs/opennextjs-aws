import fs from "node:fs";
import path from "node:path";

import { buildSync } from "esbuild";
import { OpenNextConfig } from "types/open-next.js";

import logger from "../logger.js";

export function compileOpenNextConfigNode(
  outputDir: string,
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  const sourcePath = path.join(
    process.cwd(),
    openNextConfigPath ?? "open-next.config.ts",
  );
  const outputPath = path.join(outputDir, "open-next.config.mjs");

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
      external: nodeExternals ? nodeExternals.split(",") : [],
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
  tempDir: string,
  config: OpenNextConfig,
  openNextConfigPath?: string,
) {
  const sourcePath = path.join(
    process.cwd(),
    openNextConfigPath ?? "open-next.config.ts",
  );
  const outputPath = path.join(tempDir, "open-next.config.edge.mjs");

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
    logger.info("Compiling open-next.config.ts for edge runtime.", outputPath);
    buildSync({
      entryPoints: [sourcePath],
      outfile: outputPath,
      bundle: true,
      format: "esm",
      target: ["es2020"],
      conditions: ["worker", "browser"],
      platform: "browser",
      external: config.edgeExternals ?? [],
    });
    logger.info("Compiled open-next.config.ts for edge runtime.");
  }
}
