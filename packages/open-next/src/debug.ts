import fs from "node:fs";
import path from "node:path";
import type { BuildOptions } from "./build/helper";

let init = false;

export function addDebugFile(
  options: BuildOptions,
  name: string,
  content: unknown,
) {
  if (!init) {
    fs.mkdirSync(path.join(options.outputDir, ".debug"), { recursive: true });
    init = true;
  }
  const strContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(options.outputDir, ".debug", name), strContent);
}
