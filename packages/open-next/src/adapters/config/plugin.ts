import { Plugin } from "esbuild";
import { readFileSync } from "fs";
import path from "path";

import {
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadHtmlPages,
  loadMiddlewareManifest,
  loadPrerenderManifest,
  loadRoutesManifest,
} from "./util.js";

export interface IPluginSettings {
  nextDir: string;
  outputPath: string;
  overrides?: {
    wrapper?: string;
    converter?: string;
  };
}

/**
 * @returns
 */
export default function openNextConfigPlugin({
  nextDir,
  outputPath,
  overrides,
}: IPluginSettings): Plugin {
  return {
    name: "opennext-config",
    setup(build) {
      build.onResolve({ filter: /\.\/middleware.mjs/g }, () => {
        console.log("middleware.mjs");
        return {
          path: path.join(outputPath, "edgeFunctionHandler.js"),
        };
      });

      build.onLoad({ filter: /core\/resolve.ts/g }, async (args) => {
        let contents = readFileSync(args.path, "utf-8");
        if (overrides?.wrapper) {
          contents = contents.replace(
            "../wrappers/aws-lambda.js",
            `../wrappers/${overrides.wrapper}.js`,
          );
        }
        return {
          contents,
        };
      });

      build.onLoad({ filter: /adapters\/config\/index.ts/g }, async () => {
        console.log("opennext-config-plugin");
        const NextConfig = loadConfig(nextDir);
        const BuildId = loadBuildId(nextDir);
        const HtmlPages = loadHtmlPages(nextDir);
        const RoutesManifest = loadRoutesManifest(nextDir);
        const ConfigHeaders = loadConfigHeaders(nextDir);
        const PrerenderManifest = loadPrerenderManifest(nextDir);
        const AppPathsManifestKeys = loadAppPathsManifestKeys(nextDir);
        const MiddlewareManifest = loadMiddlewareManifest(nextDir);

        const contents = `
import path from "path";

import { debug } from "../logger";

if(!globalThis.__dirname) {
  globalThis.__dirname = ""
}

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");

debug({ NEXT_DIR, OPEN_NEXT_DIR });

export const NextConfig = ${JSON.stringify(NextConfig)};
export const BuildId = ${JSON.stringify(BuildId)};
export const HtmlPages = ${JSON.stringify(HtmlPages)};
export const RoutesManifest = ${JSON.stringify(RoutesManifest)};
export const ConfigHeaders = ${JSON.stringify(ConfigHeaders)};
export const PrerenderManifest = ${JSON.stringify(PrerenderManifest)};
export const AppPathsManifestKeys = ${JSON.stringify(AppPathsManifestKeys)};
export const MiddlewareManifest = ${JSON.stringify(MiddlewareManifest)};

        `;
        return {
          contents,
        };
      });
    },
  };
}
