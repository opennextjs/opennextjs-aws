import { createPatchCode } from "./astCodePatcher.js";
import type { CodePatcher } from "./codePatcher";

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

const envVarRuleCreator = (envVar: string, value: string) => `
rule:
  kind: member_expression
  pattern: process.env.${envVar}
  inside:
    kind: if_statement
    stopBy: end
fix:
  '${value}'
`;

export const patchNextServer: CodePatcher = {
  name: "patch-next-server",
  patches: [
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /next-server\.(js)$/,
        contentFilter: /process\.env\.NEXT_MINIMAL/,
        patchCode: createPatchCode(minimalRule),
      },
    },
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /next-server\.(js)$/,
        contentFilter: /this\.nextConfig\.experimental\.preloadEntriesOnStart/,
        patchCode: createPatchCode(disablePreloadingRule),
      },
    },
  ],
};

export const patchEnvVars: CodePatcher = {
  name: "patch-env-vars",
  patches: [
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /module\.compiled\.js$/,
        contentFilter: /process\.env\.NEXT_RUNTIME/,
        patchCode: createPatchCode(envVarRuleCreator("NEXT_RUNTIME", '"node"')),
      },
    },
    {
      versions: ">=15.0.0",
      field: {
        pathFilter:
          /(module\.compiled|react\/index|react\/jsx-runtime|react-dom\/index)\.js$/,
        contentFilter: /process\.env\.NODE_ENV/,
        patchCode: createPatchCode(
          envVarRuleCreator("NODE_ENV", '"production"'),
        ),
      },
    },
    {
      versions: ">=15.0.0",
      field: {
        pathFilter: /module\.compiled\.js$/,
        contentFilter: /process\.env\.TURBOPACK/,
        patchCode: createPatchCode(envVarRuleCreator("TURBOPACK", "false")),
      },
    },
  ],
};
