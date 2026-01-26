#!/usr/bin/env node

import { build } from "./build.js";

const command = process.argv[2];
if (command !== "build") printHelp();

const args = parseArgs();
if (Object.keys(args).includes("--help")) printHelp();

await build(
  args["--config-path"],
  args["--node-externals"],
  args["--dangerously-use-unsupported-next-version"] !== undefined,
);

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
  console.log(`Unknown command

Usage:
  npx open-next build
You can use a custom config path here
  npx open-next build --config-path ./path/to/open-next.config.ts
You can configure externals for the esbuild compilation of the open-next.config.ts file
  npx open-next build --node-externals aws-sdk,sharp,sqlite3
`);

  process.exit(1);
}
