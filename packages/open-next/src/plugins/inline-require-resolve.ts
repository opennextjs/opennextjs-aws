import fs from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "esbuild";

/**
 * Inlines calls to `require.resolve` in JavaScript files.
 *
 * esbuild does not statically analyse `require.resolve` calls, and the polyfill
 * does not include an implementation to handle them. This can be problematic
 * if you attempt to dynamically import a file built by esbuild that unknowingly
 * contains `require.resolve` calls, as they will throw an error during import.
 */
export const inlineRequireResolvePlugin: Plugin = {
  name: "inline-require-resolve",
  setup: (build) => {
    build.onLoad({ filter: /\.(js|ts|mjs|cjs)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, "utf-8");
      const transformed = source.replace(
        /require\.resolve\((?<quote>['"])((?:\\.|.)*?)\k<quote>\)/g,
        (_, quote, modulePath) => {
          try {
            return JSON.stringify(createRequire(args.path).resolve(modulePath));
          } catch {
            return `require.resolve(${quote}${modulePath}${quote})`;
          }
        },
      );

      return { contents: transformed, loader: "default" };
    });
  },
};
