import { createPatchCode, patchCode } from "../astCodePatcher.js";
import type { CodePatcher, PatchCodeFn } from "../codePatcher.js";

/**
 * Creates a rule to replace `process.env.${envVar}` by `value` in the condition of if statements
 * This is used to avoid loading unnecessary deps at runtime
 * @param envVar The env var that we want to replace
 * @param value The value that we want to replace it with
 * @returns
 */
export const envVarRuleCreator = (envVar: string, value: string) => `
rule:
  kind: member_expression
  pattern: process.env.${envVar}
  inside:
    kind: parenthesized_expression
    stopBy: end
    inside:
      kind: if_statement
fix:
  '${value}'
`;

function isTurbopackBuild(tracedFiles: string[]): boolean {
  const hasTurboRuntime = tracedFiles.some((file) =>
    /-turbo[.-].*\.runtime\.(prod|dev)\.js$/.test(file),
  );
  const hasNonTurboRuntime = tracedFiles.some(
    (file) =>
      /\.runtime\.(prod|dev)\.js$/.test(file) && !/-turbo[.-]/.test(file),
  );
  return hasTurboRuntime && !hasNonTurboRuntime;
}

const createTurbopackPatch: PatchCodeFn = async ({ code, tracedFiles }) => {
  const value = isTurbopackBuild(tracedFiles) ? "true" : "false";
  return patchCode(code, envVarRuleCreator("TURBOPACK", value));
};

export const patchEnvVars: CodePatcher = {
  name: "patch-env-vars",
  patches: [
    // This patch will set the `NEXT_RUNTIME` env var to "node" to avoid loading unnecessary edge deps at runtime
    {
      versions: ">=15.0.0",
      pathFilter: /module\.compiled\.js$/,
      contentFilter: /process\.env\.NEXT_RUNTIME/,
      patchCode: createPatchCode(envVarRuleCreator("NEXT_RUNTIME", '"node"')),
    },
    // This patch will set `NODE_ENV` to production to avoid loading unnecessary dev deps at runtime
    {
      versions: ">=15.0.0",
      pathFilter:
        /(module\.compiled|react\/index|react\/jsx-runtime|react-dom\/index)\.js$/,
      contentFilter: /process\.env\.NODE_ENV/,
      patchCode: createPatchCode(envVarRuleCreator("NODE_ENV", '"production"')),
    },
    // Turbopack builds only include *-turbo.runtime.prod.js files, so we detect and set accordingly
    {
      versions: ">=15.0.0",
      pathFilter: /module\.compiled\.js$/,
      contentFilter: /process\.env\.TURBOPACK/,
      patchCode: createTurbopackPatch,
    },
  ],
};
