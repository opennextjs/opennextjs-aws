import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

// This rule will replace the `NEXT_MINIMAL` env variable with true in multiple places to avoid executing unwanted path (i.e. next middleware, edge functions and image optimization)
export const minimalRule = `
rule:
  kind: member_expression
  pattern: process.env.NEXT_MINIMAL
  any:
    - inside:
        kind: parenthesized_expression
        stopBy: end
        inside:
          kind: if_statement
          any:
            - inside:
                kind: statement_block
                inside:
                  kind: method_definition
                  any:
                    - has: {kind: property_identifier, field: name, regex: runEdgeFunction}
                    - has: {kind: property_identifier, field: name, regex: runMiddleware}
                    - has: {kind: property_identifier, field: name, regex: imageOptimizer}
            - has:
                kind: statement_block
                has:
                  kind: expression_statement
                  pattern: res.statusCode = 400;
fix:
  'true'
`;

// This rule will disable the background preloading of route done by NextServer by default during the creation of NextServer
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

// This rule is mostly for splitted edge functions so that we don't try to match them on the other non edge functions
export const removeMiddlewareManifestRule = `
rule:
  kind: statement_block
  inside:
    kind: method_definition
    has:
      kind: property_identifier
      regex: getMiddlewareManifest
fix:
  '{return null;}'
`;

export const patchNextServer: CodePatcher = {
  name: "patch-next-server",
  patches: [
    // Skip executing next middleware, edge functions and image optimization inside NextServer
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /next-server\.(js)$/,
        contentFilter: /process\.env\.NEXT_MINIMAL/,
        patchCode: createPatchCode(minimalRule),
      },
    },
    // Disable Next background preloading done at creation of `NetxServer`
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /next-server\.(js)$/,
        contentFilter: /this\.nextConfig\.experimental\.preloadEntriesOnStart/,
        patchCode: createPatchCode(disablePreloadingRule),
      },
    },
    // Don't match edge functions in `NextServer`
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /next-server\.(js)$/,
        contentFilter: /getMiddlewareManifest/,
        patchCode: createPatchCode(removeMiddlewareManifestRule),
      },
    },
  ],
};
