import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

export const rule = `
rule:
  kind: call_expression
  pattern: $PROMISE
  all:
    - has: { pattern: $_.arrayBuffer().then, stopBy: end }
    - has: { pattern: "Buffer.from", stopBy: end }
    - any:
        - inside:
            kind: sequence_expression
            inside:
                kind: return_statement
        - inside:
            kind: expression_statement
            precedes:
                kind: return_statement
    - has: { pattern: $_.FETCH, stopBy: end }

fix: |
  globalThis.__openNextAls?.getStore()?.pendingPromiseRunner.add($PROMISE)
`;

export const patchFetchCacheSetMissingWaitUntil: CodePatcher = {
  name: "patch-fetch-cache-set-missing-wait-until",
  patches: [
    {
      versions: ">=15.0.0",
      pathFilter: getCrossPlatformPathRegex(
        String.raw`(server/chunks/.*\.js|.*\.runtime\..*\.js|patch-fetch\.js)$`,
        { escape: false },
      ),
      contentFilter: /arrayBuffer\(\)\s*\.then/,
      patchCode: createPatchCode(rule),
    },
  ],
};
