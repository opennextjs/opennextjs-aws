#!/usr/bin/env node

import { build } from "./build.js";

interface ExtraArgs {
  installCommand?: string | undefined;
  disableMinimalMode?: string;
}

interface Options {
  installCommand: string | undefined;
  minimalMode: boolean;
}

const command: string = process.argv[2];

const extraArgs: object = process.argv
  .slice(3)
  .reduce<Record<string, string | boolean>>((acc, arg) => {
    if (arg.includes("=")) {
      const [key, value] = arg.split("=");
      acc[key] = value;
      return acc;
    }
    acc[arg] = true;
    return acc;
  }, {});

const { installCommand, disableMinimalMode }: ExtraArgs = extraArgs;

if (command === "build") {
  const options: Options = {
    installCommand,
    minimalMode: !disableMinimalMode,
  };
  console.log("Building with options", options);
  build(options);
} else {
  console.log("Unknown command");
  console.log("");
  console.log("Usage:");
  console.log("  npx open-next build");
  console.log("");
}
