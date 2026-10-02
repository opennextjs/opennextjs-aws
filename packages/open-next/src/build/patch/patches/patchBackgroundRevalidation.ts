import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

// Matches the check that decides whether a cached entry can be served as is in `ResponseCache.get`:
//   if (entry && !context.isOnDemandRevalidate) { ...; if (!entry.isStale || context.isPrefetch) return ... }
// which is minified in the compiled runtimes as:
//   if ((a = ...) && !r.isOnDemandRevalidate && (n(a), i = !0, !a.isStale || r.isPrefetch)) return a;
export const rule = `
rule:
  kind: binary_expression
  # The names are mangled in the minified runtimes
  pattern: "!$ENTRY.isStale || $CONTEXT.isPrefetch"
  all:
    # It has to be the whole check, not a part of a bigger expression
    - not:
        inside:
          kind: binary_expression
    # It has to be guarded by the on-demand revalidation check
    - inside:
        kind: if_statement
        stopBy: end
        has:
          field: condition
          regex: '!\\s*(\\w+\\.)?isOnDemandRevalidate'
fix:
  'true'`;

export const patchBackgroundRevalidation = {
  name: "patchBackgroundRevalidation",
  patches: [
    {
      // TODO: test for earlier versions of Next
      versions: ">=14.1.0",
      // Since Next 15.5 route modules use their own `ResponseCache`, which is inlined (and minified)
      // in `next/dist/compiled/next-server/*.runtime.prod.js`
      pathFilter: getCrossPlatformPathRegex(
        String.raw`(server/response-cache/index\.js|\.runtime\.prod\.js)$`,
        { escape: false },
      ),
      contentFilter: /\.isStale\s*\|\|\s*\w+\.isPrefetch/,
      patchCode: createPatchCode(rule),
    },
  ],
} satisfies CodePatcher;
