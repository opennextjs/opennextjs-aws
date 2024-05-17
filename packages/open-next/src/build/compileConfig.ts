import fs from "node:fs";
import path from "node:path";

import { buildSync } from "esbuild";

import logger from "../logger.js";

export function compileOpenNextConfigNode(
  tempDir: string,
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  const sourcePath = path.join(
    process.cwd(),
    openNextConfigPath ?? "open-next.config.ts",
  );
  const outputPath = path.join(tempDir, "open-next.config.mjs");

  //Check if open-next.config.ts exists
  if (!fs.existsSync(sourcePath)) {
    //Create a simple open-next.config.mjs file
    logger.debug("Cannot find open-next.config.ts. Using default config.");
    fs.writeFileSync(
      outputPath,
      [
        "var config = { default: { } };",
        "var open_next_config_default = config;",
        "export { open_next_config_default as default };",
      ].join("\n"),
    );
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
