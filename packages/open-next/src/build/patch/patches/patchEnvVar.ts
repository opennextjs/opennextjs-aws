import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher";

export const envVarRuleCreator = (envVar: string, value: string) => `
rule:
  kind: member_expression
  pattern: process.env.${envVar}
  inside:
    kind: if_statement
    stopBy: end
fix:
  '${value}'
`;

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
