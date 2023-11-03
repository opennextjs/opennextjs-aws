#!/usr/bin/env node

import * as esbuild from "esbuild";
import path from "path";

import { build } from "./build.js";

const command = process.argv[2];
if (command !== "build") printHelp();

const args = parseArgs();
if (Object.keys(args).includes("--help")) printHelp();

//TODO: validate config file

const outputTmpPath = path.join(process.cwd(), ".open-next", ".build");

// Compile open-next.config.ts
esbuild.buildSync({
  entryPoints: [path.join(process.cwd(), "open-next.config.ts")],
  outfile: path.join(outputTmpPath, "open-next.config.js"),
  bundle: true,
  format: "cjs",
  target: ["node18"],
});

const config = await import(outputTmpPath + "/open-next.config.js");

build(config.default);

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
  console.log("  npx open-next build --build-command 'npm run custom:build'");
  console.log("");

  process.exit(1);
}
