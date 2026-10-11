import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

/**
 * Keeps the runtime alive until a fetch cache entry is written.
 *
 * Next writes the fetch cache in the background once the response body has been read
 * (`arrayBuffer().then(...)`) without registering the write with a `waitUntil`, so the
 * runtime can stop before the entry is stored.
 *
 * The write is registered the same way `waitUntil` is provided to Next (see
 * `provideNextAfterProvider`): with the runtime `waitUntil` when the wrapper provides one,
 * otherwise with the request `pendingPromiseRunner`. On Cloudflare, the runtime `waitUntil`
 * (`ctx.waitUntil`) also covers writes that start after the runner has been drained, i.e.
 * when a stale entry is revalidated in the background.
 *
 * The fix evaluates to the original promise because Next 15.4+ assigns it
 * (`const cacheSetPromise = cloned1.arrayBuffer().then(...)`) and awaits it later.
 *
 * The match is anchored on the start of the promise chain (`res.arrayBuffer().then` or
 * `res.clone().arrayBuffer().then`): up to Next 15.4, the whole `fetch` implementation is
 * also a call (`getTracer().trace(...)`) assigned to a variable that contains the write.
 */
export const rule = `
rule:
  kind: call_expression
  pattern: $PROMISE
  # Starts with the receiver of \`arrayBuffer()\`, not with an enclosing call.
  regex: '^[\\w$]+(?:\\s*\\.\\s*clone\\(\\))?\\s*\\.\\s*arrayBuffer\\(\\)\\s*\\.\\s*then'
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
        # Next 15.4+: \`const cacheSetPromise = cloned1.arrayBuffer().then(...)\`
        - inside:
            kind: variable_declarator
    - has: { pattern: $_.FETCH, stopBy: end }
    # Do not match the code produced by the fix.
    - not: { regex: __openNextAls }

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
