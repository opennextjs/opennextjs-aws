import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

/**
 * Keeps the runtime alive until a fetch cache entry is written.
 *
 * Next writes the fetch cache in the background (`res.arrayBuffer().then(...)`) without a `waitUntil`.
 * The write is registered like the `waitUntil` provided to Next (see `provideNextAfterProvider`):
 * with the runtime `waitUntil` when available, so that writes starting after the request has been
 * drained (background revalidation) are covered, otherwise with the `pendingPromiseRunner`.
 *
 * The fix evaluates to the original promise, Next 15.4+ awaits it.
 */
export const rule = `
rule:
  kind: call_expression
  pattern: $PROMISE
  all:
    # \`x.arrayBuffer().then(...).catch(...).finally(...)\`.
    # Arguments are not searched so that enclosing calls (\`getTracer().trace(...)\` up to Next 15.4)
    # and the patched code do not match.
    - has: { pattern: $_.arrayBuffer().then, stopBy: { kind: arguments } }
    - has: { pattern: "Buffer.from", stopBy: end }
    - has: { pattern: $_.FETCH, stopBy: end }
    - any:
        - inside: { kind: sequence_expression, inside: { kind: return_statement } }
        - inside: { kind: expression_statement, precedes: { kind: return_statement } }
        # Next 15.4+: \`const cacheSetPromise = cloned1.arrayBuffer().then(...)\`
        - inside: { kind: variable_declarator }

fix: |
  ((promise) => {
    const store = globalThis.__openNextAls?.getStore();
    if (store?.waitUntil) {
      store.waitUntil(promise);
    } else {
      store?.pendingPromiseRunner.add(promise);
    }
    return promise;
  })($PROMISE)
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
