/**
 * Patches to avoid pulling babel (~4MB).
 *
 * Details:
 * - empty `NextServer#runMiddleware` and `NextServer#runEdgeFunction` that are not used
 * - drop `next/dist/server/node-environment-extensions/error-inspect.js`
 */

import { getCrossPlatformPathRegex } from "utils/regex";
import { patchCode } from "../astCodePatcher";
import type { CodePatcher } from "../codePatcher";

export const patchDropBabel: CodePatcher = {
  name: "patch-drop-babel",
  patches: [
    // Empty the body of `NextServer#runMiddleware`
    {
      field: {
        pathFilter: getCrossPlatformPathRegex(
          String.raw`/next/dist/server/next-server\.js$`,
          {
            escape: false,
          },
        ),
        contentFilter: /runMiddleware\(/,
        patchCode: async ({ code }) =>
          patchCode(code, createEmptyBodyRule("runMiddleware")),
      },
    },
    // Empty the body of `NextServer#runEdgeFunction`
    {
      field: {
        pathFilter: getCrossPlatformPathRegex(
          String.raw`/next/dist/server/next-server\.js$`,
          {
            escape: false,
          },
        ),
        contentFilter: /runMiddleware\(/,
        patchCode: async ({ code }) =>
          patchCode(code, createEmptyBodyRule("runEdgeFunction")),
      },
    },
    // Drop `error-inspect` that pulls babel
    {
      field: {
        pathFilter: getCrossPlatformPathRegex(
          String.raw`next/dist/server/node-environment\.js$`,
          {
            escape: false,
          },
        ),
        contentFilter: /error-inspect/,
        patchCode: async ({ code }) => patchCode(code, "errorInspectRule"),
      },
    },
  ],
};

/**
 * Swaps the body for a throwing implementation
 *
 * @param methodName The name of the method
 * @returns A rule to replace the body with a `throw`
 */
export function createEmptyBodyRule(methodName: string) {
  return `
rule:
  pattern:
    selector: method_definition
    context: "class { async ${methodName}($$$PARAMS) { $$$_ } }"
fix: |-
  async ${methodName}($$$PARAMS) {
    throw new Error("${methodName} should not be called with OpenNext");
  }
`;
}

/**
 * Drops `require("./node-environment-extensions/error-inspect");`
 */
export const errorInspectRule = `
rule:
  pattern: require("./node-environment-extensions/error-inspect");
fix: |-
  // Removed by OpenNext
  // require("./node-environment-extensions/error-inspect");
`;
