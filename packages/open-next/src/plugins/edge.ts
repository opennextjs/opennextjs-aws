import { readFileSync } from "node:fs";
import path from "node:path";

import chalk from "chalk";
import type { Plugin } from "esbuild";
import type { MiddlewareInfo } from "types/next-types.js";

import {
  loadAppPathRoutesManifest,
  loadAppPathsManifest,
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadFunctionsConfigManifest,
  loadHtmlPages,
  loadMiddlewareManifest,
  loadPrerenderManifest,
  loadRoutesManifest,
} from "../adapters/config/util.js";
import logger from "../logger.js";
import { getCrossPlatformPathRegex } from "../utils/regex.js";

export interface IPluginSettings {
  nextDir: string;
  middlewareInfo?: MiddlewareInfo;
  isInCloudfare?: boolean;
}

/**
 * @param opts.nextDir - The path to the .next directory
 * @param opts.middlewareInfo - Information about the middleware
 * @param opts.isInCloudfare - Whether the code runs on the cloudflare runtime
 * @returns
 */
export function openNextEdgePlugins({
  nextDir,
  middlewareInfo,
  isInCloudfare,
}: IPluginSettings): Plugin {
  const entryFiles =
    middlewareInfo?.files.map((file: string) => path.join(nextDir, file)) ?? [];
  const routes = middlewareInfo
    ? [
        {
          name: middlewareInfo.name || "/",
          page: middlewareInfo.page,
          regex: middlewareInfo.matchers.map((m) => m.regexp),
        },
      ]
    : [];
  const wasmFiles = middlewareInfo?.wasm ?? [];

  return {
    name: "opennext-edge",
    setup(build) {
      logger.debug(chalk.blue("OpenNext Edge plugin"));

      build.onResolve({ filter: /\.(mjs|wasm)$/g }, () => {
        return {
          external: true,
        };
      });

      //Copied from https://github.com/cloudflare/next-on-pages/blob/7a18efb5cab4d86c8e3e222fc94ea88ac05baffd/packages/next-on-pages/src/buildApplication/processVercelFunctions/build.ts#L86-L112

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
        ({ path }) => ({
          contents: `export * from '${path}'`,
          loader: "js",
        }),
      );

      // We inject the entry files into the edgeFunctionHandler
      build.onLoad(
        { filter: getCrossPlatformPathRegex("/edgeFunctionHandler.js") },
        async (args) => {
          let contents = readFileSync(args.path, "utf-8");
          contents = `
globalThis._ENTRIES = {};
globalThis.self = globalThis;
globalThis._ROUTES = ${JSON.stringify(routes)};

${
  isInCloudfare
    ? ""
    : `
import {readFileSync} from "node:fs";
import path from "node:path";
function addDuplexToInit(init) {
  return typeof init === 'undefined' ||
    (typeof init === 'object' && init.duplex === undefined)
    ? { duplex: 'half', ...init }
    : init
}
// We need to override Request to add duplex to the init, it seems Next expects it to work like this
class OverrideRequest extends Request {
  constructor(input, init) {
    super(input, addDuplexToInit(init))
  }
}
globalThis.Request = OverrideRequest;

// If we're not in cloudflare, we polyfill crypto
// https://github.com/vercel/edge-runtime/blob/main/packages/primitives/src/primitives/crypto.js
import { webcrypto } from 'node:crypto'
if(!globalThis.crypto){
  globalThis.crypto = new webcrypto.Crypto()
}
if(!globalThis.CryptoKey){
  globalThis.CryptoKey = webcrypto.CryptoKey
}
function SubtleCrypto() {
  if (!(this instanceof SubtleCrypto)) return new SubtleCrypto()
  throw TypeError('Illegal constructor')
}
if(!globalThis.SubtleCrypto) {
  globalThis.SubtleCrypto = SubtleCrypto
}
if(!globalThis.Crypto) {
  globalThis.Crypto = webcrypto.Crypto
}
// We also need to polyfill URLPattern
if (!globalThis.URLPattern) {
  await import("urlpattern-polyfill");
}
`
}
${wasmFiles
  .map((file, i) =>
    isInCloudfare
      ? // Decorate the name to avoid name collisions
        `import __OpenNextWasm${i} from './wasm/${file.name}.wasm';
globalThis.${file.name} = __OpenNextWasm${i}`
      : `const ${file.name} = readFileSync(path.join(__dirname,'/wasm/${file.name}.wasm'));`,
  )
  .join("\n")}
${entryFiles.map((file) => `require("${file}");`).join("\n")}
${contents}
        `;

          return {
            contents,
          };
        },
      );

      build.onLoad(
        { filter: getCrossPlatformPathRegex("adapters/config/index") },
        async () => {
          const NextConfig = loadConfig(nextDir);
          const BuildId = loadBuildId(nextDir);
          const HtmlPages = loadHtmlPages(nextDir);
          const RoutesManifest = loadRoutesManifest(nextDir);
          const ConfigHeaders = loadConfigHeaders(nextDir);
          const PrerenderManifest = loadPrerenderManifest(nextDir);
          const AppPathsManifestKeys = loadAppPathsManifestKeys(nextDir);
          const MiddlewareManifest = loadMiddlewareManifest(nextDir);
          const AppPathsManifest = loadAppPathsManifest(nextDir);
          const AppPathRoutesManifest = loadAppPathRoutesManifest(nextDir);
          const FunctionsConfigManifest = loadFunctionsConfigManifest(nextDir);

          const contents = `
  import path from "node:path";

  import { debug } from "../logger";

  globalThis.__dirname ??= "";

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
  export const AppPathsManifest = ${JSON.stringify(AppPathsManifest)};
  export const AppPathRoutesManifest = ${JSON.stringify(AppPathRoutesManifest)};
  export const FunctionsConfigManifest = ${JSON.stringify(FunctionsConfigManifest)};


  process.env.NEXT_BUILD_ID = BuildId;
`;
          return { contents };
        },
      );
    },
  };
}
