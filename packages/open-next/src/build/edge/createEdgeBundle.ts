import { mkdirSync } from "node:fs";

import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import type { MiddlewareInfo, MiddlewareManifest } from "types/next-types";
import type {
  IncludedConverter,
  IncludedOriginResolver,
  LazyLoadedOverride,
  OverrideOptions,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

import type { OriginResolver } from "types/overrides.js";
import logger from "../../logger.js";
import { openNextEdgePlugins } from "../../plugins/edge.js";
import { openNextReplacementPlugin } from "../../plugins/replacement.js";
import { openNextResolvePlugin } from "../../plugins/resolve.js";
import { getCrossPlatformPathRegex } from "../../utils/regex.js";
import { type BuildOptions, isEdgeRuntime } from "../helper.js";
import { copyOpenNextConfig, esbuildAsync } from "../helper.js";
import { openNextExternalMiddlewarePlugin } from "../../plugins/externalMiddleware.js";

type Override = OverrideOptions & {
  originResolver?: LazyLoadedOverride<OriginResolver> | IncludedOriginResolver;
};
interface BuildEdgeBundleOptions {
  middlewareInfo?: MiddlewareInfo;
  entrypoint: string;
  outfile: string;
  options: BuildOptions;
  overrides?: Override;
  defaultConverter?: IncludedConverter;
  additionalInject?: string;
  includeCache?: boolean;
  additionalExternals?: string[];
  onlyBuildOnce?: boolean;
  name: string;
}

export async function buildEdgeBundle({
  middlewareInfo,
  entrypoint,
  outfile,
  options,
  defaultConverter,
  overrides,
  additionalInject,
  includeCache,
  additionalExternals,
  onlyBuildOnce,
  name,
}: BuildEdgeBundleOptions) {
  const isInCloudfare = await isEdgeRuntime(overrides);
  function override<T extends keyof Override>(target: T) {
    return typeof overrides?.[target] === "string"
      ? overrides[target]
      : undefined;
  }
  await esbuildAsync(
    {
      entryPoints: [entrypoint],
      bundle: true,
      outfile,
      external: ["node:*", "next", "@aws-sdk/*"],
      target: "es2022",
      platform: "neutral",
      plugins: [
        openNextResolvePlugin({
          overrides: {
            wrapper: override("wrapper") ?? "aws-lambda",
            converter: override("converter") ?? defaultConverter,
            ...(includeCache
              ? {
                  tagCache: override("tagCache") ?? "dynamodb-lite",
                  incrementalCache: override("incrementalCache") ?? "s3-lite",
                  queue: override("queue") ?? "sqs-lite",
                }
              : {}),
            originResolver: override("originResolver") ?? "pattern-env",
            proxyExternalRequest: override("proxyExternalRequest") ?? "node",
          },
          fnName: name,
        }),
        openNextReplacementPlugin({
          name: "externalMiddlewareOverrides",
          target: getCrossPlatformPathRegex("adapters/middleware.js"),
          deletes: includeCache ? [] : ["includeCacheInMiddleware"],
        }),
        openNextExternalMiddlewarePlugin(
          path.join(options.openNextDistDir, "core", "edgeFunctionHandler.js"),
        ),
        openNextEdgePlugins({
          middlewareInfo,
          nextDir: path.join(options.appBuildOutputPath, ".next"),
          isInCloudfare,
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
import {Buffer} from "node:buffer";
globalThis.Buffer = Buffer;

import {AsyncLocalStorage} from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;

${
  ""
  /**
   * Next.js sets this `__import_unsupported` on `globalThis` (with `configurable: false`):
   *  https://github.com/vercel/next.js/blob/5b7833e3/packages/next/src/server/web/globals.ts#L94-L98
   *
   * It does so in both the middleware and the main server, so if the middleware runs in the same place
   * as the main handler this code gets run twice triggering a runtime error.
   *
   * For this reason we need to patch `Object.defineProperty` to avoid this issue.
   */
}
const defaultDefineProperty = Object.defineProperty;
Object.defineProperty = function(o, p, a) {
  if(p=== '__import_unsupported' && Boolean(globalThis.__import_unsupported)) {
    return;
  }
  return defaultDefineProperty(o, p, a);
};

  ${
    isInCloudfare
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

  if (!onlyBuildOnce) {
    await build({
      entryPoints: [outfile],
      outfile,
      allowOverwrite: true,
      bundle: true,
      minify: options.minify,
      platform: "node",
      format: "esm",
      conditions: ["workerd", "worker", "browser"],
      external: ["node:*", ...(additionalExternals ?? [])],
      banner: {
        js: 'import * as process from "node:process";',
      },
    });
  }
}

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
  copyOpenNextConfig(options.buildDir, outputPath, true);

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
  const middlewareInfo = functions[0];

  //Copy wasm files
  const wasmFiles = middlewareInfo.wasm;
  mkdirSync(path.join(outputPath, "wasm"), { recursive: true });
  for (const wasmFile of wasmFiles) {
    fs.copyFileSync(
      path.join(appBuildOutputPath, ".next", wasmFile.filePath),
      path.join(outputPath, `wasm/${wasmFile.name}.wasm`),
    );
  }

  // Copy assets
  const assets = middlewareInfo.assets;
  mkdirSync(path.join(outputPath, "assets"), { recursive: true });
  for (const asset of assets) {
    fs.copyFileSync(
      path.join(appBuildOutputPath, ".next", asset.filePath),
      path.join(outputPath, `assets/${asset.name}`),
    );
  }

  await buildEdgeBundle({
    middlewareInfo,
    entrypoint: path.join(
      options.openNextDistDir,
      "adapters",
      "edge-adapter.js",
    ),
    outfile: path.join(outputPath, "index.mjs"),
    options,
    overrides: fnOptions.override,
    additionalExternals: options.config.edgeExternals,
    name,
  });
}
