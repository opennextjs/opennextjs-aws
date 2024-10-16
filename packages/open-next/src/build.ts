import cp from "node:child_process";
import fs from "node:fs";
import { createRequire as topLevelCreateRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import {
  buildNextjsApp,
  setStandaloneBuildMode,
} from "./build/buildNextApp.js";
import { compileCache } from "./build/compileCache.js";
import { compileOpenNextConfig } from "./build/compileConfig.js";
import { createCacheAssets, createStaticAssets } from "./build/createAssets.js";
import { createMiddleware } from "./build/createMiddleware.js";
import { createServerBundle } from "./build/createServerBundle.js";
import { generateOutput } from "./build/generateOutput.js";
import * as buildHelper from "./build/helper.js";
import { printHeader } from "./build/utils.js";
import logger from "./logger.js";
import { openNextReplacementPlugin } from "./plugins/replacement.js";
import { openNextResolvePlugin } from "./plugins/resolve.js";

const require = topLevelCreateRequire(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export type PublicFiles = {
  files: string[];
};

export async function build(
  openNextConfigPath?: string,
  nodeExternals?: string,
) {
  buildHelper.showWarningOnWindows();

  const baseDir = process.cwd();

  const { config, buildDir } = await compileOpenNextConfig(
    baseDir,
    openNextConfigPath,
    nodeExternals,
  );

  // Initialize options
  const options = buildHelper.normalizeOptions(config, __dirname, buildDir);
  logger.setLevel(options.debug ? "debug" : "info");

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  buildHelper.printNextjsVersion(options);
  buildHelper.printOpenNextVersion(options);

  // Build Next.js app
  printHeader("Building Next.js app");
  setStandaloneBuildMode(options);
  buildNextjsApp(options);

  // Generate deployable bundle
  printHeader("Generating bundle");
  buildHelper.initOutputDir(options);

  // Compile cache.ts
  compileCache(options);

  // Compile middleware
  await createMiddleware(options);

  createStaticAssets(options);
  await createCacheAssets(options);

  await createServerBundle(options);
  await createRevalidationBundle(options);
  await createImageOptimizationBundle(options);
  await createWarmerBundle(options);
  await generateOutput(options);
  logger.info("OpenNext build complete.");
}

async function createWarmerBundle(options: buildHelper.BuildOptions) {
  logger.info(`Bundling warmer function...`);

  const { config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "warmer-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adatper relys on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.
  await buildHelper.esbuildAsync(
    {
      entryPoints: [path.join(__dirname, "adapters", "warmer-function.js")],
      external: ["next"],
      outfile: path.join(outputPath, "index.mjs"),
      plugins: [
        openNextResolvePlugin({
          overrides: {
            converter: config.warmer?.override?.converter ?? "dummy",
            wrapper: config.warmer?.override?.wrapper,
          },
          fnName: "warmer",
        }),
      ],
      banner: {
        js: [
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join(""),
      },
    },
    options,
  );
}

async function createRevalidationBundle(options: buildHelper.BuildOptions) {
  logger.info(`Bundling revalidation function...`);

  const { appBuildOutputPath, config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "revalidation-function");
  fs.mkdirSync(outputPath, { recursive: true });

  //Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  // Build Lambda code
  await buildHelper.esbuildAsync(
    {
      external: ["next", "styled-jsx", "react"],
      entryPoints: [path.join(__dirname, "adapters", "revalidate.js")],
      outfile: path.join(outputPath, "index.mjs"),
      plugins: [
        openNextResolvePlugin({
          fnName: "revalidate",
          overrides: {
            converter:
              config.revalidate?.override?.converter ?? "sqs-revalidate",
            wrapper: config.revalidate?.override?.wrapper,
          },
        }),
      ],
    },
    options,
  );

  // Copy over .next/prerender-manifest.json file
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next", "prerender-manifest.json"),
    path.join(outputPath, "prerender-manifest.json"),
  );
}

async function createImageOptimizationBundle(
  options: buildHelper.BuildOptions,
) {
  logger.info(`Bundling image optimization function...`);

  const { appPath, appBuildOutputPath, config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "image-optimization-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  const plugins = [
    openNextResolvePlugin({
      fnName: "imageOptimization",
      overrides: {
        converter: config.imageOptimization?.override?.converter,
        wrapper: config.imageOptimization?.override?.wrapper,
        imageLoader: config.imageOptimization?.loader,
      },
    }),
  ];

  if (buildHelper.compareSemver(options.nextVersion, "14.1.1") >= 0) {
    plugins.push(
      openNextReplacementPlugin({
        name: "opennext-14.1.1-image-optimization",
        target:
          /plugins(\/|\\)image-optimization(\/|\\)image-optimization\.js/g,
        replacements: [
          require.resolve(
            "./adapters/plugins/image-optimization/image-optimization.replacement.js",
          ),
        ],
      }),
    );
  }

  // Build Lambda code (1st pass)
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "@aws-sdk/client-s3" package which is not a dependency in user's
  //       Next.js app.
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(__dirname, "adapters", "image-optimization-adapter.js"),
      ],
      external: ["sharp", "next"],
      outfile: path.join(outputPath, "index.mjs"),
      plugins,
    },
    options,
  );

  // Build Lambda code (2nd pass)
  // note: bundle in user's Next.js app again b/c the adapter relies on the
  //       "next" package. And the "next" package from user's app should
  //       be used. We also set @opentelemetry/api as external because it seems to be
  //       required by Next 15 even though it's not used.
  buildHelper.esbuildSync(
    {
      entryPoints: [path.join(outputPath, "index.mjs")],
      external: ["sharp", "@opentelemetry/api"],
      allowOverwrite: true,
      outfile: path.join(outputPath, "index.mjs"),
      banner: {
        js: [
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join("\n"),
      },
    },
    options,
  );

  // Copy over .next/required-server-files.json file and BUILD_ID
  fs.mkdirSync(path.join(outputPath, ".next"));
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next/required-server-files.json"),
    path.join(outputPath, ".next/required-server-files.json"),
  );
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next/BUILD_ID"),
    path.join(outputPath, ".next/BUILD_ID"),
  );

  // Sharp provides pre-build binaries for all platforms. https://github.com/lovell/sharp/blob/main/docs/install.md#cross-platform
  // Target should be same as used by Lambda, see https://github.com/sst/sst/blob/ca6f763fdfddd099ce2260202d0ce48c72e211ea/packages/sst/src/constructs/NextjsSite.ts#L114
  // For SHARP_IGNORE_GLOBAL_LIBVIPS see: https://github.com/lovell/sharp/blob/main/docs/install.md#aws-lambda

  const nodeOutputPath = path.resolve(outputPath);
  const sharpVersion = process.env.SHARP_VERSION ?? "0.32.6";

  const arch = config.imageOptimization?.arch ?? "arm64";
  const nodeVersion = config.imageOptimization?.nodeVersion ?? "18";

  //check if we are running in Windows environment then set env variables accordingly.
  try {
    cp.execSync(
      // We might want to change the arch args to cpu args, it seems to be the documented way
      `npm install --arch=${arch} --platform=linux --target=${nodeVersion} --libc=glibc --prefix="${nodeOutputPath}" sharp@${sharpVersion}`,
      {
        stdio: "pipe",
        cwd: appPath,
        env: {
          ...process.env,
          SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
        },
      },
    );
  } catch (e: any) {
    logger.error(e.stdout.toString());
    logger.error(e.stderr.toString());
    logger.error("Failed to install sharp.");
  }
}
