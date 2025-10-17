import { getCrossPlatformPathRegex } from "utils/regex.js";
import type { NextAdapterOutputs } from "../adapter.js";
import { patchCode } from "../build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "./content-updater.js";

export function inlineRouteHandler(
  updater: ContentUpdater,
  outputs: NextAdapterOutputs,
): Plugin {
  console.log("## inlineRouteHandler");
  return updater.updateContent("inlineRouteHandler", [
    {
      filter: getCrossPlatformPathRegex(
        String.raw`core/routing/adapterHandler\.js$`,
        {
          escape: false,
        },
      ),
      contentFilter: /getHandler/,
      callback: ({ contents }) => patchCode(contents, inlineRule(outputs)),
    },
  ]);
}

function inlineRule(outputs: NextAdapterOutputs) {
  const routeToHandlerPath: Record<string, string> = {};

  for (const type of ["pages", "pagesApi", "appPages", "appRoutes"] as const) {
    for (const { pathname, filePath } of outputs[type]) {
      routeToHandlerPath[pathname] = filePath;
    }
  }

  return `
rule:
  pattern: "function getHandler($ROUTE) { $$$BODY }"
fix: |-
  function getHandler($ROUTE) {
    switch($ROUTE.route) {
${Object.entries(routeToHandlerPath)
  .map(([route, file]) => `      case "${route}": return require("${file}");`)
  .join("\n")}
      default:
        throw new Error(\`Not found \${$ROUTE.route}\`);
    }

  }`;
}
