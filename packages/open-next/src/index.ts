#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { buildSync } from "esbuild";
import { OpenNextConfig } from "types/open-next.js";

import { build } from "./build.js";
import logger from "./logger.js";

const command = process.argv[2];
if (command !== "build") printHelp();

const args = parseArgs();
if (Object.keys(args).includes("--help")) printHelp();

// Load open-next.config.ts
const tempDir = initTempDir();
const openNextConfigPath = args["--config-path"];
const configPath = compileOpenNextConfig(tempDir, openNextConfigPath);
const buildConfig = (await import(configPath)).default as OpenNextConfig;

build(buildConfig);

function parseArgs() {
  return process.argv.slice(2).reduce(
    (acc, key, ind, self) => {
      if (key.startsWith("--")) {
        if (self[ind + 1] && self[ind + 1].startsWith("-")) {
          acc[key] = undefined;
        } else if (self[ind + 1]) {
          acc[key] = self[ind + 1];
        } else if (!self[ind + 1]) {
          acc[key] = undefined;
        }
      }
      return acc;
    },
    {} as Record<string, string | undefined>,
  );
}

function printHelp() {
  console.log("Unknown command");
  console.log("");
  console.log("Usage:");
  console.log("  npx open-next build");
  console.log(
    "  npx open-next build --config-path ./path/to/open-next.config.ts",
  );
  console.log("");

  process.exit(1);
}

function initTempDir() {
  const dir = path.join(process.cwd(), ".open-next");
  const tempDir = path.join(dir, ".build");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function compileOpenNextConfig(tempDir: string, openNextConfigPath?: string) {
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
    });
  }

  return outputPath;
}
