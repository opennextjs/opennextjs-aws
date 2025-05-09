#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { build } from "./build.js";
import { LOCAL_CONFIG, LOCAL_CONFIG_PATH } from "./build/constant.js";
import { printHeader } from "./build/utils.js";

const command = process.argv[2];
const stage = process.argv[3];
const validCommand = 
  command === "build" || 
  command === "preview" || 
  (command === "generate" && stage === "local");

if (!validCommand) {
  printHelp();
}

const args = parseArgs();
if (Object.keys(args).includes("--help")) printHelp();

if (command === "build") {
  await build(args["--config-path"], args["--node-externals"]);
} else if (command === "generate" && stage === "local") {
  generateLocalConfig();
} else if (command === "preview") {
  await buildLocalConfig();
  runLocally();
}
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

async function buildLocalConfig() {
  if (!existsSync(LOCAL_CONFIG_PATH)) {
    console.error(
      "open-next.config.local.ts does not exist. You can run `generate local` first to generate it.",
    );
    process.exit(1);
  }

  // Build OpenNext with dev overrides
  printHeader("Building OpenNext with open-next.config.local.ts");
  await build(LOCAL_CONFIG_PATH, args["--node-externals"]);
}

function runLocally() {
  const handlerPath = path.join(
    ".open-next",
    "server-functions",
    "default",
    "index.mjs",
  );
  if (!existsSync(handlerPath)) {
    console.error(
      "OpenNext server function not found. Please build it before running this command.",
    );
    process.exit(1);
  }
  printHeader("Running OpenNext locally");
  spawnSync("node", [handlerPath], {
    stdio: "inherit",
    shell: true,
  });
}

function generateLocalConfig() {
  if (existsSync(LOCAL_CONFIG_PATH)) {
    console.error(
      "open-next.config.local.ts already exists. Please remove it before running this command.",
    );
    process.exit(1);
  }

  try {
    writeFileSync(LOCAL_CONFIG_PATH, LOCAL_CONFIG);
  } catch (e) {
    console.error("Error writing open-next.config.local.ts", e);
  }
}

function printHelp() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║             Unknown Command              ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log("Usage:");
  console.log("  npx open-next build");
  console.log("      Build the project with OpenNext.\n");

  console.log("Options:");
  console.log("  --config-path <path>");
  console.log("      Use a custom config path.");
  console.log(
    "      Usage: npx open-next build --config-path ./path/to/open-next.config.ts\n",
  );

  console.log("  --node-externals <modules>");
  console.log("      Configure externals for the esbuild compilation of the");
  console.log("      open-next.config.ts file.");
  console.log(
    "      Usage: npx open-next build --node-externals aws-sdk,sharp,sqlite3\n",
  );

  console.log("Other commands:");
  console.log("  preview");
  console.log(
    "      Build and run OpenNext locally with open-next.config.local.ts",
  );

  console.log("  generate local");
  console.log(
    "      Generate a config file with dev overrides for OpenNext in open-next.config.local.ts",
  );

  process.exit(1);
}
