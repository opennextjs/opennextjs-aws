import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "./next-types.js";

export function setNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
}

export function loadConfig(nextDir: string) {
  const filePath = path.join(nextDir, "required-server-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const { config } = JSON.parse(json);
  return config as NextConfig;
}
