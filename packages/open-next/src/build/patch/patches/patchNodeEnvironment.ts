import { Lang } from "@ast-grep/napi";
import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

/**
 * Drops `require("./node-environment-extensions/error-inspect");`
 *
 * This is to avoid pulling babel (~4MB)
 */
export const rule = `
rule:
  pattern: require("./node-environment-extensions/error-inspect");
fix: |-
  // Removed by OpenNext
  // require("./node-environment-extensions/error-inspect");
`;

export const patchNodeEnvironment: CodePatcher = {
  name: "patch-node-environment-error-inspect",
  patches: [
    {
      pathFilter: getCrossPlatformPathRegex(
        String.raw`/next/dist/server/node-environment\.js$`,
        {
          escape: false,
        },
      ),
      contentFilter: /error-inspect/,
      patchCode: createPatchCode(rule, Lang.JavaScript),
      versions: ">=15.0.0",
    },
  ],
};
