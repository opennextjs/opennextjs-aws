import { readFileSync } from "node:fs";
import path from "node:path";

import { Plugin } from "esbuild";
import { MiddlewareInfo } from "types/next-types.js";

import {
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadHtmlPages,
  loadMiddlewareManifest,
  loadPrerenderManifest,
  loadRoutesManifest,
} from "../adapters/config/util.js";

export interface IPluginSettings {
  nextDir: string;
  edgeFunctionHandlerPath?: string;
  middlewareInfo: MiddlewareInfo;
}

/**
 * TODO: Handle wasm import
 * @param opts.nextDir - The path to the .next directory
 * @param opts.edgeFunctionHandlerPath - The path to the edgeFunctionHandler.js file that we'll use to bundle the routing
 * @param opts.entryFiles - The entry files that we'll inject into the edgeFunctionHandler.js file
 * @returns
 */
export function openNextEdgePlugins({
  nextDir,
  edgeFunctionHandlerPath,
  middlewareInfo,
}: IPluginSettings): Plugin {
  const entryFiles = middlewareInfo.files.map((file: string) =>
    path.join(nextDir, file),
  );
  const routes = [
    {
      name: middlewareInfo.name || "/",
      page: middlewareInfo.page,
      regex: middlewareInfo.matchers.map((m) => m.regexp),
    },
  ];
  const wasmFiles = middlewareInfo.wasm ?? [];
  return {
    name: "opennext-edge",
    setup(build) {
      if (edgeFunctionHandlerPath) {
        // If we bundle the routing, we need to resolve the middleware
        build.onResolve({ filter: /\.\/middleware.mjs/g }, () => {
          return {
            path: edgeFunctionHandlerPath,
          };
        });
      }

      build.onResolve({ filter: /\.(mjs|wasm)$/g }, (args) => {
        return {
          external: true,
        };
      });

      //COpied from https://github.com/cloudflare/next-on-pages/blob/7a18efb5cab4d86c8e3e222fc94ea88ac05baffd/packages/next-on-pages/src/buildApplication/processVercelFunctions/build.ts#L86-L112

      build.onResolve({ filter: /^node:/ }, ({ kind, path }) => {
        // this plugin converts `require("node:*")` calls, those are the only ones that
        // need updating (esm imports to "node:*" are totally valid), so here we tag with the
        // node-buffer namespace only imports that are require calls
        return kind === "require-call"
          ? { path, namespace: "node-built-in-modules" }
          : undefined;
      });

      // we convert the imports we tagged with the node-built-in-modules namespace so that instead of `require("node:*")`
      // they import from `export * from "node:*";`
      build.onLoad(
        { filter: /.*/, namespace: "node-built-in-modules" },
        ({ path }) => {
          return {
            contents: `export * from '${path}'`,
            loader: "js",
          };
        },
      );

      // We inject the entry files into the edgeFunctionHandler
      build.onLoad({ filter: /\/edgeFunctionHandler.js/g }, async (args) => {
        let contents = readFileSync(args.path, "utf-8");
        contents = `
globalThis._ENTRIES = {};
globalThis.self = globalThis;
if(!globalThis.process){
  globalThis.process = {env: {}};
}
globalThis._ROUTES = ${JSON.stringify(routes)};

import {Buffer} from "node:buffer";
globalThis.Buffer = Buffer;
import crypto from "node:crypto";
globalThis.crypto = crypto;

import {AsyncLocalStorage} from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;
${wasmFiles
  .map((file) => `import ${file.name} from './wasm/${file.name}.wasm';`)
  .join("\n")}
${entryFiles?.map((file) => `require("${file}");`).join("\n")}
${contents}        
        `;
        return {
          contents,
        };
      });

      build.onLoad({ filter: /adapters\/config\/index/g }, async () => {
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
