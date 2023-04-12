import fs from "node:fs";
import path from "node:path";

export function loadConfig(nextDir: string) {
  const filePath = path.join(nextDir, "required-server-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const { config } = JSON.parse(json);
  return config;
}
