#!/usr/bin/env node

import { build } from "./build.js";
import { parseArgs } from "./utils/args.js";

const command = process.argv[2];
if (command !== "build") printHelp();

const args = parseArgs(process.argv.slice(2));
if (args.help) printHelp();

await build(
  args.configPath,
  args.nodeExternals,
  args.dangerouslyUseUnsupportedNextVersion,
);

function printHelp() {
  console.log(`Unknown command

Usage:
  npx open-next build
You can use a custom config path here
  npx open-next build --config-path ./path/to/open-next.config.ts
You can configure externals for the esbuild compilation of the open-next.config.ts file
  npx open-next build --node-externals aws-sdk,sharp,sqlite3
You can build with a Next.js version that is not supported by the Next.js team anymore
  npx open-next build --dangerously-use-unsupported-next-version
`);

  process.exit(1);
}
