import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

/**
 * Force `context.trustHostHeader` to be true when invoking `res.revalidate("/path")` from pages router.
 *
 * `trustHostHeader` is inlined at build time and is only true when building on Vercel.
 * Without it, and without a router server, `revalidate` throws
 * `Invariant: missing internal router-server-methods this is an internal bug`.
 *
 * It sets the value once at the top of the `revalidate` function so that every check is covered:
 *
 * ```js
 * async function revalidate(urlPath, opts, req, context) {
 *   // ...
 *   if (context.trustHostHeader || context.dev) {
 *     allowedRevalidateHeaderKeys.push('cookie');
 *   }
 *   if (context.trustHostHeader) {
 *     allowedRevalidateHeaderKeys.push('x-vercel-protection-bypass');
 *   }
 *   // ...
 *   if (context.trustHostHeader) {
 *     const res = await fetch(`https://${req.headers.host}${urlPath}`, { method: 'HEAD', headers });
 *     // ...
 *   } else {
 *     throw new Error(`Invariant: missing internal router-server-methods this is an internal bug`);
 *   }
 * }
 * ```
 *
 * https://github.com/vercel/next.js/blob/178a4c7/packages/next/src/server/api-utils/node/api-resolver.ts#L301
 */
export const trustHostHeaderRule = `
rule:
  pattern: async function $FN($$$ARGS) { $$$BODY }
  all:
    - has:
        pattern: if ($CONTEXT.trustHostHeader) { $$$_ }
        stopBy: end
    - has:
        regex: "^x-vercel-protection-bypass$"
        stopBy: end
    - has:
        regex: "Invariant: missing internal"
        stopBy: end
fix: |-
  async function $FN($$$ARGS) {
    $CONTEXT.trustHostHeader = true;
    $$$BODY
  }
`;

/**
 * Use the protocol of the request for the `HEAD` request made by `res.revalidate("/path")`.
 *
 * It replaces the hardcoded `https` in:
 *
 * ```js
 * const res = await fetch(`https://${req.headers.host}${urlPath}`, { method: 'HEAD', headers });
 * ```
 */
export const headFetchProtocolRule = `
rule:
  kind: template_string
  pattern: "\`https://\${$REQ.headers.host}\${$PATH}\`"
  inside:
    kind: arguments
    has:
      kind: object
      regex: HEAD
    inside:
      kind: call_expression
      has:
        kind: identifier
        regex: ^fetch$
fix:
  '\`\${$REQ.headers["x-forwarded-proto"] || "https"}://\${$REQ.headers.host}\${$PATH}\`'
`;

const pathFilter = getCrossPlatformPathRegex(
  String.raw`/next/dist/compiled/next-server/pages-api(-turbo)?\.runtime\.prod\.js$`,
  {
    escape: false,
  },
);

export const patchPagesApiRuntimeProd: CodePatcher = {
  name: "patch-pages-api-runtime-prod",
  patches: [
    {
      pathFilter,
      contentFilter: /trustHostHeader/,
      patchCode: createPatchCode(trustHostHeaderRule),
      versions: ">=15.0.0",
    },
    {
      pathFilter,
      contentFilter: /https/,
      patchCode: createPatchCode(headFetchProtocolRule),
      versions: ">=15.0.0",
    },
  ],
};
