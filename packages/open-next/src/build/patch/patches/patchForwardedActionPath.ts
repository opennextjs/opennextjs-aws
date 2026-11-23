import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

const PLACEHOLDER = "_forwarded-action";

/**
 * Source of the calls appended to the pathname of the forwarded request.
 *
 * A dynamic segment is replaced by one placeholder. A static segment of an App Router page can
 * not start with an underscore (it marks a private folder), so no static route matches the path.
 *
 * A catch-all segment, optional or not, is replaced by two placeholders. A single one would be
 * routed to a `[id]` sibling of the catch-all, which takes precedence and does not have the
 * action. A sibling with two dynamic segments (`[a]/[b]`) still takes precedence.
 */
export const dynamicSegmentsReplacement = String.raw`.replace(/\[+\.{3}[^\]]+\]+/g, "${PLACEHOLDER}/${PLACEHOLDER}").replace(/\[[^\]]+\]/g, "${PLACEHOLDER}")`;

/**
 * Replaces the dynamic segments in the path of a forwarded Server Action request.
 *
 * When a Server Action is posted to a page whose bundle does not contain it, Next forwards the
 * request over HTTP to a page that does (`createForwardedActionResponse`). The path of that
 * request is the route pattern of the target page, i.e. `/items/[id]/edit`, and Next skips the
 * rendering of the page for a forwarded request, the values of the params are not used.
 *
 * OpenNext has no local server to receive the request, it is sent to the public origin where the
 * route pattern is rejected twice:
 * - AWS Lambda function URLs answer `400` to a path containing a literal `[` or `]`
 * - the routing layer sends a path containing a placeholder to the 404 page, encoded or not
 *   (see `hasRouteParamPlaceholder`)
 * Next then replies `200 {}` or `409` and the action never runs.
 *
 * The dynamic segments are replaced by a placeholder, see `dynamicSegmentsReplacement`.
 *
 * The pattern only matches plain identifiers: the request following a redirect from an action
 * (`${origin}${url.pathname}${url.search}`) and the patched code do not match.
 */
export const rule = `
rule:
  pattern: new URL(\`\${$ORIGIN}\${$BASE_PATH}\${$PATHNAME}\`)
  # In the block that flags the request as forwarded
  inside:
    kind: statement_block
    stopBy: end
    has:
      kind: expression_statement
      has: { kind: string_fragment, regex: ^x-action-forwarded$, stopBy: end }

constraints:
  ORIGIN: { kind: identifier }
  BASE_PATH: { kind: identifier }
  PATHNAME: { kind: identifier }

fix: new URL(\`\${$ORIGIN}\${$BASE_PATH}\${$PATHNAME${dynamicSegmentsReplacement}}\`)
`;

export const patchForwardedActionPath: CodePatcher = {
  name: "patch-forwarded-action-path",
  patches: [
    {
      pathFilter: getCrossPlatformPathRegex(
        String.raw`(server/app-render/action-handler\.js|app-page[\w-]*\.runtime\.prod\.js)$`,
        { escape: false },
      ),
      contentFilter: /x-action-forwarded/,
      patchCode: createPatchCode(rule),
    },
  ],
};
