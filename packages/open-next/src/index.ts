#!/usr/bin/env node

import { build } from "./build.js";

const command = process.argv[2];
if (command !== "build") printHelp();

const args = parseArgs();
if (Object.keys(args).includes("--help")) printHelp();

await build(args["--config-path"], args["--node-externals"]);

function parseArgs() {
  return process.argv.slice(2).reduce(
    (acc, key, ind, self) => {
      if (key.startsWith("--")) {
        if (self[ind + 1] && self[ind + 1].startsWith("-")) {
          acc[key] = undefined;
        } else if (self[ind + 1]) {
          acc[key] = self[ind + 1];
          // eslint-disable-next-line sonarjs/elseif-without-else
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
  console.log("You can use a custom config path here");
  console.log(
    "  npx open-next build --config-path ./path/to/open-next.config.ts",
  );
  console.log(
    "You can configure externals for the esbuild compilation of the open-next.config.ts file",
  );
  console.log("  npx open-next build --node-externals aws-sdk,sharp,sqlite3");
  console.log("");

  process.exit(1);
}
