import type { Plugin } from "esbuild";
import { getCrossPlatformPathRegex } from "utils/regex.js";

export function openNextExternalMiddlewarePlugin(functionPath: string): Plugin {
  return {
    name: "open-next-external-node-middleware",
    setup(build) {
      // If we bundle the routing, we need to resolve the middleware
      build.onResolve(
        { filter: getCrossPlatformPathRegex("./middleware.mjs") },
        () => ({ path: functionPath }),
      );
    },
  };
}
