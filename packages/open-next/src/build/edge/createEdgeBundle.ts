import { mkdirSync } from "node:fs";

import fs from "node:fs";
import path from "node:path";
import { type Plugin, build } from "esbuild";
import type { MiddlewareInfo } from "types/next-types";
import type {
  IncludedConverter,
  IncludedOriginResolver,
  LazyLoadedOverride,
  OverrideOptions,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

import { loadMiddlewareManifest } from "config/util.js";
import type { OriginResolver } from "types/overrides.js";
import logger from "../../logger.js";
import { ContentUpdater } from "../../plugins/content-updater.js";
import { openNextEdgePlugins } from "../../plugins/edge.js";
import { openNextExternalMiddlewarePlugin } from "../../plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "../../plugins/replacement.js";
import { openNextResolvePlugin } from "../../plugins/resolve.js";
import { getCrossPlatformPathRegex } from "../../utils/regex.js";
import { type BuildOptions, isEdgeRuntime } from "../helper.js";
import { copyOpenNextConfig, esbuildAsync } from "../helper.js";

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
  additionalPlugins?: (contentUpdater: ContentUpdater) => Plugin[];
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
  additionalPlugins: additionalPluginsFn,
}: BuildEdgeBundleOptions) {
  const isInCloudflare = await isEdgeRuntime(overrides);
  function override<T extends keyof Override>(target: T) {
    return typeof overrides?.[target] === "string"
      ? overrides[target]
      : undefined;
  }
  const contentUpdater = new ContentUpdater(options);
  const additionalPlugins = additionalPluginsFn
    ? additionalPluginsFn(contentUpdater)
    : [];
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
          path.join(options.openNextDistDir, "core/edgeFunctionHandler.js"),
        ),
        openNextEdgePlugins({
          middlewareInfo,
          nextDir: path.join(options.appBuildOutputPath, ".next"),
          isInCloudflare,
        }),
        ...additionalPlugins,
        // The content updater plugin must be the last plugin
        contentUpdater.plugin,
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
    isInCloudflare
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
  additionalPlugins: (contentUpdater: ContentUpdater) => Plugin[] = () => [],
) {
  logger.info(`Generating edge bundle for: ${name}`);

  const buildOutputDotNextDir = path.join(options.appBuildOutputPath, ".next");

  // Create output folder
  const outputDir = path.join(options.outputDir, "server-functions", name);
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy open-next.config.mjs
  copyOpenNextConfig(options.buildDir, outputDir, true);

  // Load middleware manifest
  const middlewareManifest = loadMiddlewareManifest(buildOutputDotNextDir);

  // Find functions
  const functions = Object.values(middlewareManifest.functions).filter((fn) =>
    fnOptions.routes.includes(fn.name as RouteTemplate),
  );

  if (functions.length > 1) {
    throw new Error("Only one function is supported for now");
  }
  const middlewareInfo = functions[0];

  copyMiddlewareResources(options, middlewareInfo, outputDir);

  await buildEdgeBundle({
    middlewareInfo,
    entrypoint: path.join(options.openNextDistDir, "adapters/edge-adapter.js"),
    outfile: path.join(outputDir, "index.mjs"),
    options,
    overrides: fnOptions.override,
    additionalExternals: options.config.edgeExternals,
    name,
    additionalPlugins,
  });
}

/**
 * Copy wasm files and assets into the destDir.
 */
export function copyMiddlewareResources(
  options: BuildOptions,
  middlewareInfo: MiddlewareInfo | undefined,
  destDir: string,
) {
  mkdirSync(path.join(destDir, "wasm"), { recursive: true });
  for (const file of middlewareInfo?.wasm ?? []) {
    fs.copyFileSync(
      path.join(options.appBuildOutputPath, ".next", file.filePath),
      path.join(destDir, `wasm/${file.name}.wasm`),
    );
  }

  mkdirSync(path.join(destDir, "assets"), { recursive: true });
  for (const file of middlewareInfo?.assets ?? []) {
    fs.copyFileSync(
      path.join(options.appBuildOutputPath, ".next", file.filePath),
      path.join(destDir, `assets/${file.name}`),
    );
  }
}
