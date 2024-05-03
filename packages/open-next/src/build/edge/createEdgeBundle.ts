import { mkdirSync } from "node:fs";
import url from "node:url";

import fs from "fs";
import path from "path";
import { MiddlewareInfo, MiddlewareManifest } from "types/next-types";
import {
  DefaultOverrideOptions,
  IncludedConverter,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

import logger from "../../logger.js";
import { openNextEdgePlugins } from "../../plugins/edge.js";
import { openNextResolvePlugin } from "../../plugins/resolve.js";
import { BuildOptions, copyOpenNextConfig, esbuildAsync } from "../helper.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

interface BuildEdgeBundleOptions {
  appBuildOutputPath: string;
  middlewareInfo: MiddlewareInfo;
  entrypoint: string;
  outfile: string;
  options: BuildOptions;
  overrides?: DefaultOverrideOptions;
  defaultConverter?: IncludedConverter;
  additionalInject?: string;
}

export async function buildEdgeBundle({
  appBuildOutputPath,
  middlewareInfo,
  entrypoint,
  outfile,
  options,
  defaultConverter,
  overrides,
  additionalInject,
}: BuildEdgeBundleOptions) {
  await esbuildAsync(
    {
      entryPoints: [entrypoint],
      // inject: ,
      bundle: true,
      outfile,
      external: ["node:*", "next", "@aws-sdk/*"],
      target: "es2022",
      platform: "neutral",
      plugins: [
        openNextResolvePlugin({
          overrides: {
            wrapper:
              typeof overrides?.wrapper === "string"
                ? overrides.wrapper
                : "aws-lambda",
            converter:
              typeof overrides?.converter === "string"
                ? overrides.converter
                : defaultConverter,
          },
        }),
        openNextEdgePlugins({
          middlewareInfo,
          nextDir: path.join(appBuildOutputPath, ".next"),
          edgeFunctionHandlerPath: path.join(
            __dirname,
            "../../core",
            "edgeFunctionHandler.js",
          ),
          isInCloudfare: overrides?.wrapper === "cloudflare",
        }),
      ],
      treeShaking: true,
      alias: {
        path: "node:path",
        stream: "node:stream",
        fs: "node:fs",
      },
      conditions: ["module"],
      mainFields: ["module", "main"],
      banner: {
        js: `
  ${
    overrides?.wrapper === "cloudflare"
      ? ""
      : `
  const require = (await import("node:module")).createRequire(import.meta.url);
  const __filename = (await import("node:url")).fileURLToPath(import.meta.url);
  const __dirname = (await import("node:path")).dirname(__filename);
  `
  }
  ${additionalInject ?? ""}
  `,
      },
    },
    options,
  );
}

export function copyMiddlewareAssetsAndWasm({}) {}

export async function generateEdgeBundle(
  name: string,
  options: BuildOptions,
  fnOptions: SplittedFunctionOptions,
) {
  const { appBuildOutputPath, outputDir } = options;
  logger.info(`Generating edge bundle for: ${name}`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-functions", name);
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs
  copyOpenNextConfig(path.join(outputDir, ".build"), outputPath);

  // Load middleware manifest
  const middlewareManifest = JSON.parse(
    fs.readFileSync(
      path.join(appBuildOutputPath, ".next/server/middleware-manifest.json"),
      "utf8",
    ),
  ) as MiddlewareManifest;

  // Find functions
  const functions = Object.values(middlewareManifest.functions).filter((fn) =>
    fnOptions.routes.includes(fn.name as RouteTemplate),
  );

  if (functions.length > 1) {
    throw new Error("Only one function is supported for now");
  }
  const fn = functions[0];

  //Copy wasm files
  const wasmFiles = fn.wasm;
  mkdirSync(path.join(outputPath, "wasm"), { recursive: true });
  for (const wasmFile of wasmFiles) {
    fs.copyFileSync(
      path.join(appBuildOutputPath, ".next", wasmFile.filePath),
      path.join(outputPath, `wasm/${wasmFile.name}.wasm`),
    );
  }

  // Copy assets
  const assets = fn.assets;
  mkdirSync(path.join(outputPath, "assets"), { recursive: true });
  for (const asset of assets) {
    fs.copyFileSync(
      path.join(appBuildOutputPath, ".next", asset.filePath),
      path.join(outputPath, `assets/${asset.name}`),
    );
  }

  await buildEdgeBundle({
    appBuildOutputPath,
    middlewareInfo: fn,
    entrypoint: path.join(__dirname, "../../adapters", "edge-adapter.js"),
    outfile: path.join(outputPath, "index.mjs"),
    options,
    overrides: fnOptions.override,
  });
}
