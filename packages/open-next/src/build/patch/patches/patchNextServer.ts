import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

// Disable the background preloading of route done by NextServer by default during the creation of NextServer
export const disablePreloadingRule = `
rule:
  kind: statement_block
  inside:
    kind: if_statement
    any:
      - has:
          kind: member_expression
          pattern: this.nextConfig.experimental.preloadEntriesOnStart
          stopBy: end
      - has:
          kind: binary_expression
          pattern: appDocumentPreloading === true
          stopBy: end
fix:
  '{}'
`;

// Mostly for splitted edge functions so that we don't try to match them on the other non edge functions
export const removeMiddlewareManifestRule = `
rule:
  kind: statement_block
  inside:
    kind: method_definition
    has:
      kind: property_identifier
      regex: ^getMiddlewareManifest$
fix:
  '{return null;}'
`;

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

const pathFilter = getCrossPlatformPathRegex(
  String.raw`/next/dist/server/next-server\.js$`,
  {
    escape: false,
  },
);

/**
 * Patches to avoid pulling babel (~4MB).
 *
 * Details:
 * - empty `NextServer#runMiddleware` and `NextServer#runEdgeFunction` that are not used
 * - drop `next/dist/server/node-environment-extensions/error-inspect.js`
 */
const babelPatches = [
  // Empty the body of `NextServer#runMiddleware`
  {
    pathFilter,
    contentFilter: /runMiddleware\(/,
    patchCode: createPatchCode(createEmptyBodyRule("runMiddleware")),
  },
  // Empty the body of `NextServer#runEdgeFunction`
  {
    pathFilter,
    contentFilter: /runEdgeFunction\(/,
    patchCode: createPatchCode(createEmptyBodyRule("runEdgeFunction")),
  },
];

export const patchNextServer: CodePatcher = {
  name: "patch-next-server",
  patches: [
    // Empty the body of `NextServer#imageOptimizer` - unused in OpenNext
    {
      pathFilter,
      contentFilter: /imageOptimizer\(/,
      patchCode: createPatchCode(createEmptyBodyRule("imageOptimizer")),
    },
    // Disable Next background preloading done at creation of `NextServer`
    {
      versions: ">=14.0.0",
      pathFilter,
      contentFilter: /this\.nextConfig\.experimental\.preloadEntriesOnStart/,
      patchCode: createPatchCode(disablePreloadingRule),
    },
    // Don't match edge functions in `NextServer`
    {
      // Next 12 and some version of 13 use the bundled middleware/edge function
      versions: ">=14.0.0",
      pathFilter,
      contentFilter: /getMiddlewareManifest/,
      patchCode: createPatchCode(removeMiddlewareManifestRule),
    },
    ...babelPatches,
  ],
};
