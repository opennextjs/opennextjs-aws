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
    // This one will inline the route handlers into the adapterHandler's getHandler function.
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
    // For turbopack, we need to also patch the `[turbopack]_runtime.js` file.
    {
      filter: getCrossPlatformPathRegex(
        String.raw`\[turbopack\]_runtime\.js$`,
        {
          escape: false,
        },
      ),
      contentFilter: /loadRuntimeChunkPath/,
      callback: ({ contents }) => {
        console.log("## inlineRouteHandler patching turbopack runtime");
        //TODO: Just using that for now, for some reason I can't make ast-grep pick that.
        // It works in the playground, but doesn't work here.
        const result = contents.replace(
          "path.relative(RUNTIME_PUBLIC_PATH, '.')",
          '"../.next"'
        );
        console.log("## inlineRouteHandler turbopack runtime patched", result);
        return result;
      },
    }
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
