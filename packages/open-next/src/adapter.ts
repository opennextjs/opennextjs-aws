import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import type { NextConfig } from "types/next-types";
import { compileCache } from "./build/compileCache.js";
import { compileOpenNextConfig } from "./build/compileConfig.js";
import { compileTagCacheProvider } from "./build/compileTagCacheProvider.js";
import { createCacheAssets, createStaticAssets } from "./build/createAssets.js";
import { createImageOptimizationBundle } from "./build/createImageOptimizationBundle.js";
import { createMiddleware } from "./build/createMiddleware.js";
import { createRevalidationBundle } from "./build/createRevalidationBundle.js";
import { createServerBundle } from "./build/createServerBundle.js";
import { createWarmerBundle } from "./build/createWarmerBundle.js";
import { generateOutput } from "./build/generateOutput.js";
import * as buildHelper from "./build/helper.js";
import { addDebugFile } from "./debug.js";
import type { ContentUpdater } from "./plugins/content-updater.js";
import {
  externalChunksPlugin,
  inlineRouteHandler,
} from "./plugins/inlineRouteHandlers.js";

export type NextAdapterOutputs = {
  pages: any[];
  pagesApi: any[];
  appPages: any[];
  appRoutes: any[];
};

type NextAdapter = {
  name: string;
  modifyConfig: (
    config: NextConfig,
    { phase }: { phase: string },
  ) => Promise<NextConfig>;
  onBuildComplete: (props: {
    routes: any;
    outputs: NextAdapterOutputs;
    projectDir: string;
    repoRoot: string;
    distDir: string;
    config: NextConfig;
    nextVersion: string;
  }) => Promise<void>;
}; //TODO: use the one provided by Next

let buildOpts: buildHelper.BuildOptions;

export default {
  name: "OpenNext",
  async modifyConfig(nextConfig, { phase }) {
    // We have to precompile the cache here, probably compile OpenNext config as well
    const { config, buildDir } = await compileOpenNextConfig(
      "open-next.config.ts",
      { nodeExternals: undefined },
    );

    const openNextDistDir = url.fileURLToPath(new URL(".", import.meta.url));

    buildOpts = buildHelper.normalizeOptions(config, openNextDistDir, buildDir);

    buildHelper.initOutputDir(buildOpts);

    const cache = compileCache(buildOpts);

    // We then have to copy the cache files to the .next dir so that they are available at runtime
    //TODO: use a better path, this one is temporary just to make it work
    const tempCachePath = `${buildOpts.outputDir}/server-functions/default/.open-next/.build`;
    fs.mkdirSync(tempCachePath, { recursive: true });
    fs.copyFileSync(cache.cache, path.join(tempCachePath, "cache.cjs"));
    fs.copyFileSync(
      cache.composableCache,
      path.join(tempCachePath, "composable-cache.cjs"),
    );

    //TODO: We should check the version of Next here, below 16 we'd throw or show a warning
    return {
      ...nextConfig,
      cacheHandler: cache.cache, //TODO: compute that here,
      cacheMaxMemorySize: 0,
      experimental: {
        ...nextConfig.experimental,
        trustHostHeader: true,
        cacheHandlers: {
          default: cache.composableCache,
        },
      },
    };
  },
  async onBuildComplete(outputs) {
    console.log("OpenNext build will start now");

    // TODO(vicb): save outputs
    addDebugFile(buildOpts, "outputs.json", outputs);

    // Compile middleware
    await createMiddleware(buildOpts);
    console.log("Middleware created");

    createStaticAssets(buildOpts);
    console.log("Static assets created");

    if (buildOpts.config.dangerous?.disableIncrementalCache !== true) {
      const { useTagCache } = createCacheAssets(buildOpts);
      console.log("Cache assets created");
      if (useTagCache) {
        await compileTagCacheProvider(buildOpts);
        console.log("Tag cache provider compiled");
      }
    }

    await createServerBundle(
      buildOpts,
      {
        additionalPlugins: getAdditionalPluginsFactory(
          buildOpts,
          outputs.outputs,
        ),
      },
      outputs.outputs,
    );

    console.log("Server bundle created");
    await createRevalidationBundle(buildOpts);
    console.log("Revalidation bundle created");
    await createImageOptimizationBundle(buildOpts);
    console.log("Image optimization bundle created");
    await createWarmerBundle(buildOpts);
    console.log("Warmer bundle created");
    await generateOutput(buildOpts);
    console.log("Output generated");
  },
} satisfies NextAdapter;

function getAdditionalPluginsFactory(
  buildOpts: buildHelper.BuildOptions,
  outputs: NextAdapterOutputs,
) {
  return (updater: ContentUpdater) => [
    inlineRouteHandler(updater, outputs),
    externalChunksPlugin(outputs),
  ];
}
