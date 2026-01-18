import fs from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "esbuild";

export const inlineRequireResolvePlugin: Plugin = {
  name: "inline-require-resolve",
  setup: (build) => {
    build.onLoad({ filter: /\.(js|ts|mjs|cjs)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, "utf-8");
      const transformed = source.replace(
        /require\.resolve\(['"]([^'"]+)['"]\)/g,
        (_, modulePath) => {
          try {
            return JSON.stringify(createRequire(args.path).resolve(modulePath));
          } catch {
            return `require.resolve('${modulePath}')`;
          }
        },
      );

      return { contents: transformed, loader: "default" };
    });
  },
};
