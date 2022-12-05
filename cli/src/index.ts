#!/usr/bin/env node

import { build } from "./build.js";

const command = process.argv[2];

if (command === "build") {
  build();
}
else {
  console.log("Unknown command");
  console.log("");
  console.log("Usage:");
  console.log("  npx open-next build");
  console.log("");
}