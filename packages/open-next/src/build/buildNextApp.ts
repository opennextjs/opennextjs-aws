import cp from "node:child_process";
import path from "node:path";

import * as buildHelper from "./helper.js";

export function setStandaloneBuildMode(options: buildHelper.BuildOptions) {
  // Equivalent to setting `output: "standalone"` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = "true";
  // Equivalent to setting `experimental.outputFileTracingRoot` in next.config.js
  process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = options.monorepoRoot;
}

export function buildNextjsApp(options: buildHelper.BuildOptions) {
  const { config, packager } = options;
  const command =
    config.buildCommand ??
    (["bun", "npm"].includes(packager)
      ? `${packager} run build`
      : `${packager} build`);
  cp.execSync(command, {
    stdio: "inherit",
    cwd: path.dirname(options.appPackageJsonPath),
  });
}
