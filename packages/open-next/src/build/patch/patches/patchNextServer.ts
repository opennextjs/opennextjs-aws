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

// Make `handleNextImageRequest` a no-op to avoid pulling `sharp`
// Apply to Next 14, 15, and 16
export const emptyHandleNextImageRequestRule = `
rule:
  kind: assignment_expression
  pattern: this.handleNextImageRequest = $VALUE
  inside:
    kind: method_definition
    stopBy: end
    has:
      kind: property_identifier
      regex: ^constructor$
    inside:
      kind: class_body
fix:
  this.handleNextImageRequest = async (req, res, parsedUrl) => false
`;

export const provideInternalWaitUntil = `
rule:
  kind: return_statement
  inside:
    kind: method_definition
    stopBy: end
    has:
      kind: property_identifier
      regex: getInternalWaitUntil

fix:
 return globalThis.__openNextAls.getStore()?.waitUntil;
`;

/**
 * Exposes `NextNodeServer#revalidate` to `res.revalidate()` of the Pages Router API routes.
 *
 * Starting with Next 15.4, `res.revalidate()` uses the `revalidate` function of the router server
 * context (`globalThis[Symbol.for("@next/router-server-methods")]`) to revalidate in-process.
 * The context is populated by the router server which is not used by OpenNext.
 * Without it, `res.revalidate()` throws
 * `Invariant: missing internal router-server-methods this is an internal bug`.
 *
 * `NextNodeServer#handleCatchallRenderRequest` creates the context for environments without
 * router server, this rule adds `revalidate` to it:
 *
 * ```js
 * routerServerGlobal[RouterServerContextSymbol][relativeProjectDir] = {
 *   render404: this.render404.bind(this),
 *   // added by the rule
 *   revalidate: this.revalidate.bind(this),
 * };
 * ```
 *
 * OpenNext wraps `NextNodeServer#revalidate` at runtime, see `core/revalidate.ts`.
 *
 * https://github.com/vercel/next.js/blob/4e6c27b/packages/next/src/server/api-utils/node/api-resolver.ts
 */
export const exposeRevalidateRule = `
rule:
  pattern:
    context: "({ render404: this.render404.bind(this) })"
    selector: pair
  inside:
    kind: object
    not:
      has:
        kind: pair
        has:
          field: key
          regex: ^revalidate$
fix: |-
  render404: this.render404.bind(this),
  revalidate: this.revalidate.bind(this)
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
    // Make `handleNextImageRequest` a no-op to avoid pulling `sharp` - unused in OpenNext
    {
      pathFilter,
      contentFilter: /handleNextImageRequest/,
      patchCode: createPatchCode(emptyHandleNextImageRequestRule),
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
    {
      versions: ">=16.0.0",
      pathFilter,
      contentFilter: /getInternalWaitUntil/,
      patchCode: createPatchCode(provideInternalWaitUntil),
    },
    // Expose `NextNodeServer#revalidate` to `res.revalidate()`
    {
      versions: ">=15.4.0",
      pathFilter,
      contentFilter: /render404: this\.render404\.bind\(this\)/,
      patchCode: createPatchCode(exposeRevalidateRule),
    },
    ...babelPatches,
  ],
};
