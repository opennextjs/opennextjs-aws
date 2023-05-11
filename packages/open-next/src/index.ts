#!/usr/bin/env node

import { BuildArguments, build } from "./build.js";

const command = process.argv[2];

if (command === "build") {
  const buildArguments: BuildArguments = {
    buildCommand: process.argv[3] ? process.argv[3] : "build",
    appPath: ".",
  }
  build(buildArguments);
} else {
  console.log("Unknown command");
  console.log("");
  console.log("Usage:");
  console.log("  npx open-next build [custom build command]");
  console.log("");
}
