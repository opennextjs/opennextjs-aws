import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

// `context.trustHostHeader` is undefined in our case
// Trust the host header when invoking `res.revalidate("/path")` from pages router
// https://github.com/vercel/next.js/blob/178a4c7/packages/next/src/server/api-utils/node/api-resolver.ts#L301
export const trustHostHeaderRule = `
rule:
  kind: member_expression
  pattern: $CONTEXT.trustHostHeader
  inside:
    kind: parenthesized_expression
    inside:
      kind: if_statement
      all:
        - has:
            regex: await
            kind: statement_block
            has:
              kind: lexical_declaration
              regex: HEAD
              has:
                kind: variable_declarator
                has:
                  kind: await_expression
                  has:
                    kind: call_expression
                    has:
                      kind: identifier
                      regex: ^fetch$
fix:
  'true'
`;

// Use correct protocol from `NextInternalRequestMeta` when doing HEAD fetch for revalidation
export const headFetchProtocolRule = `
rule:
  kind: string_fragment
  regex: ^https://
  inside:
    kind: template_string
    inside:
      kind: arguments
      has:
        kind: object
        regex: HEAD
      inside:
        kind: call_expression
        inside:
          kind: await_expression
          regex: fetch
          inside: 
            kind: variable_declarator
            inside:
              kind: lexical_declaration
              regex: x-vercel-cache
              inside:
                kind: statement_block
                inside: 
                  kind: if_statement
fix:
  '\${r.headers["x-forwarded-proto"] || "https"}://'
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
    // Trust the host header when invoking `res.revalidate("") from pages router
    {
      pathFilter,
      contentFilter: /trustHostHeader/,
      patchCode: createPatchCode(trustHostHeaderRule),
      versions: ">=15.0.0",
    },
    // Use correct protocol from `NextInternalRequestMeta` when doing HEAD fetch for revalidation
    {
      pathFilter,
      contentFilter: /https/,
      patchCode: createPatchCode(headFetchProtocolRule),
      versions: ">=15.0.0",
    },
  ],
};
