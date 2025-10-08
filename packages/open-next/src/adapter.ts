import type { NextConfig } from "types/next-types";
import { compileOpenNextConfig } from "./build/compileConfig.js";
import { compileCache } from "./build/compileCache.js";
import * as buildHelper from "./build/helper.js";
import url from "node:url";
import {copyFileSync} from "node:fs"
import { createMiddleware } from "./build/createMiddleware.js";
import { createCacheAssets, createStaticAssets } from "./build/createAssets.js";
import { compileTagCacheProvider } from "./build/compileTagCacheProvider.js";
import { createImageOptimizationBundle } from "./build/createImageOptimizationBundle.js";
import { createRevalidationBundle } from "./build/createRevalidationBundle.js";
import { createServerBundle } from "./build/createServerBundle.js";
import { createWarmerBundle } from "./build/createWarmerBundle.js";
import { generateOutput } from "./build/generateOutput.js";
import fs from "node:fs";

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

let options: buildHelper.BuildOptions;

export default {
  name: "OpenNext",
  async modifyConfig(nextConfig, { phase }) {
    // We have to precompile the cache here, probably compile OpenNext config as well
     const {config, buildDir} = await compileOpenNextConfig(
        "open-next.config.ts",
        { nodeExternals: undefined },
      );

    const openNextDistDir = url.fileURLToPath(new URL(".", import.meta.url));

    options = buildHelper.normalizeOptions(
        config,
        openNextDistDir,
        buildDir,
      );

    buildHelper.initOutputDir(options);

    const cache = compileCache(options)
    // We then have to copy the cache files to the .next dir so that they are available at runtime

    fs.mkdirSync(`${options.outputDir}/server-functions/default/.open-next/.build`, { recursive: true });

    //TODO: use a better path, this one is temporary just to make it work
    copyFileSync(cache.cache, `${options.outputDir}/server-functions/default/.open-next/.build/cache.cjs`)
    copyFileSync(cache.composableCache, `${options.outputDir}/server-functions/default/.open-next/.build/composable-cache.cjs`)

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
    
    // Compile middleware
      await createMiddleware(options);
      console.log("Middleware created");

      createStaticAssets(options);
      console.log("Static assets created");

      if (options.config.dangerous?.disableIncrementalCache !== true) {
        const { useTagCache } = createCacheAssets(options);
        console.log("Cache assets created");
        if (useTagCache) {
          await compileTagCacheProvider(options);
          console.log("Tag cache provider compiled");
        }
      }

      await createServerBundle(options, undefined, outputs.outputs);

      console.log("Server bundle created");
      await createRevalidationBundle(options);
      console.log("Revalidation bundle created");
      await createImageOptimizationBundle(options);
      console.log("Image optimization bundle created");
      await createWarmerBundle(options);
      console.log("Warmer bundle created");
      await generateOutput(options);
      console.log("Output generated");
  },
} satisfies NextAdapter;
