import type { RouteDefinition } from "types/next-types.js";
import { getCrossPlatformPathRegex } from "utils/regex.js";
import { patchCode } from "../astCodePatcher.js";
import type { CodePatcher } from "../codePatcher.js";

const PLACEHOLDER = "_forwarded-action";

// A dynamic segment of a route pattern: `[id]`, `[...slug]` or `[[...slug]]`
const DYNAMIC_SEGMENT_REGEX = /\[+[^\]]+\]+/g;

/**
 * The path to forward to, by route pattern, for the routes that are not reached when each of
 * their dynamic segments is replaced by one placeholder.
 */
export type ForwardedPathOverrides = Record<string, string>;

/**
 * Returns the overrides for the catch-all routes shadowed by a dynamic sibling.
 *
 * `/docs/_forwarded-action` is routed to `/docs/[id]` when that page exists, not to
 * `/docs/[...slug]`. Placeholders are appended to the path until Next routes it to the catch-all.
 * No fixed number works for every app: a `[a]/[b]` or a `[a]/[...rest]` sibling takes the paths
 * with two segments.
 *
 * A route that no path reaches gets no override.
 *
 * @param dynamicRoutes The dynamic routes of the routes manifest, in matching order
 * @returns The path to forward to, for each route that needs more than one placeholder
 */
export function getForwardedPathOverrides(
  dynamicRoutes: RouteDefinition[],
): ForwardedPathOverrides {
  const matchers = dynamicRoutes.map(({ page, regex }) => ({
    page,
    regex: new RegExp(regex),
  }));
  const isRoutedTo = (path: string, page: string) =>
    matchers.find(({ regex }) => regex.test(path))?.page === page;
  const getDepth = (path: string) => path.split("/").length;
  // A path deeper than every route only matches catch-alls, one more segment changes nothing.
  const maxDepth = Math.max(
    0,
    ...dynamicRoutes.map(({ page }) => getDepth(page)),
  );

  return Object.fromEntries(
    dynamicRoutes.flatMap(({ page }) => {
      const path = page.replace(DYNAMIC_SEGMENT_REGEX, PLACEHOLDER);
      if (isRoutedTo(path, page)) {
        return [];
      }
      const override = Array.from(
        { length: maxDepth + 1 - getDepth(path) },
        (_, index) => `${path}${`/${PLACEHOLDER}`.repeat(index + 1)}`,
      ).find((candidate) => isRoutedTo(candidate, page));
      return override === undefined ? [] : [[page, override]];
    }),
  );
}

/**
 * Returns the source of the expression computing the path to forward to.
 *
 * Each dynamic segment is replaced by one placeholder, unless the route has an override. A static
 * segment of an App Router page can not start with an underscore (it marks a private folder), so
 * no static route matches the path.
 *
 * @param pathname The source of the expression holding the route pattern
 * @param overrides The routes that need more than one placeholder
 * @returns The source of the expression
 */
export function getForwardedPathExpression(
  pathname: string,
  overrides: ForwardedPathOverrides,
): string {
  // `$` is escaped so that a route is never read as a meta variable of the rule
  const overridesSource = JSON.stringify(overrides).replaceAll("$", "\\u0024");
  return `(${overridesSource})[${pathname}] ?? ${pathname}.replace(${DYNAMIC_SEGMENT_REGEX}, "${PLACEHOLDER}")`;
}

/**
 * Returns the rule replacing the dynamic segments in the path of a forwarded Server Action request.
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
 * The pattern only matches plain identifiers: the request following a redirect from an action
 * (`${origin}${url.pathname}${url.search}`) and the patched code do not match.
 *
 * @param overrides The routes that need more than one placeholder
 * @returns The ast-grep rule, in yaml format
 */
export function createRule(overrides: ForwardedPathOverrides): string {
  const fix = `new URL(\`\${$ORIGIN}\${$BASE_PATH}\${${getForwardedPathExpression("$PATHNAME", overrides)}}\`)`;
  return `
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

# A JSON string is a valid yaml string, whatever the routes contain
fix: ${JSON.stringify(fix)}
`;
}

export const patchForwardedActionPath: CodePatcher = {
  name: "patch-forwarded-action-path",
  patches: [
    {
      pathFilter: getCrossPlatformPathRegex(
        String.raw`(server/app-render/action-handler\.js|app-page[\w-]*\.runtime\.prod\.js)$`,
        { escape: false },
      ),
      contentFilter: /x-action-forwarded/,
      patchCode: async ({ code, manifests }) =>
        patchCode(
          code,
          createRule(
            getForwardedPathOverrides(manifests.routesManifest.routes.dynamic),
          ),
        ),
    },
  ],
};
