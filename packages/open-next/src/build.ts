import cp from "node:child_process";
import fs from "node:fs";
import { createRequire as topLevelCreateRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import { isBinaryContentType } from "./adapters/binary.js";
import {
  buildNextjsApp,
  setStandaloneBuildMode,
} from "./build/buildNextApp.js";
import { compileCache } from "./build/compileCache.js";
import { compileOpenNextConfig } from "./build/compileConfig.js";
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

function createStaticAssets(options: buildHelper.BuildOptions) {
  logger.info(`Bundling static assets...`);

  const { appBuildOutputPath, appPublicPath, outputDir, appPath } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "assets");
  fs.mkdirSync(outputPath, { recursive: true });

  // Next.js outputs assets into multiple files. Copy into the same directory.
  // Copy over:
  // - .next/BUILD_ID => _next/BUILD_ID
  // - .next/static   => _next/static
  // - public/*       => *
  // - app/favicon.ico or src/app/favicon.ico  => favicon.ico
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next/BUILD_ID"),
    path.join(outputPath, "BUILD_ID"),
  );
  fs.cpSync(
    path.join(appBuildOutputPath, ".next/static"),
    path.join(outputPath, "_next", "static"),
    { recursive: true },
  );
  if (fs.existsSync(appPublicPath)) {
    fs.cpSync(appPublicPath, outputPath, { recursive: true });
  }

  const appSrcPath = fs.existsSync(path.join(appPath, "src"))
    ? "src/app"
    : "app";

  const faviconPath = path.join(appPath, appSrcPath, "favicon.ico");

  if (fs.existsSync(faviconPath)) {
    fs.copyFileSync(faviconPath, path.join(outputPath, "favicon.ico"));
  }
}

async function createCacheAssets(options: buildHelper.BuildOptions) {
  const { config } = options;
  if (config.dangerous?.disableIncrementalCache) return;

  logger.info(`Bundling cache assets...`);

  const { appBuildOutputPath, outputDir } = options;
  const packagePath = path.relative(options.monorepoRoot, appBuildOutputPath);
  const buildId = buildHelper.getBuildId(appBuildOutputPath);

  // Copy pages to cache folder
  const dotNextPath = path.join(
    appBuildOutputPath,
    ".next/standalone",
    packagePath,
  );
  const outputPath = path.join(outputDir, "cache", buildId);
  [".next/server/pages", ".next/server/app"]
    .map((dir) => path.join(dotNextPath, dir))
    .filter(fs.existsSync)
    .forEach((dir) => fs.cpSync(dir, outputPath, { recursive: true }));

  // Remove non-cache files
  const htmlPages = buildHelper.getHtmlPages(dotNextPath);
  buildHelper.removeFiles(
    outputPath,
    (file) =>
      file.endsWith(".js") ||
      file.endsWith(".js.nft.json") ||
      (file.endsWith(".html") && htmlPages.has(file)),
  );

  //merge cache files into a single file
  const cacheFilesPath: Record<
    string,
    {
      meta?: string;
      html?: string;
      json?: string;
      rsc?: string;
      body?: string;
    }
  > = {};

  buildHelper.traverseFiles(
    outputPath,
    () => true,
    (filepath) => {
      const ext = path.extname(filepath);
      let newFilePath =
        ext !== "" ? filepath.replace(ext, ".cache") : `${filepath}.cache`;
      // Handle prefetch cache files for partial prerendering
      if (newFilePath.endsWith(".prefetch.cache")) {
        newFilePath = newFilePath.replace(".prefetch.cache", ".cache");
      }
      switch (ext) {
        case ".meta":
        case ".html":
        case ".json":
        case ".body":
        case ".rsc":
          cacheFilesPath[newFilePath] = {
            [ext.slice(1)]: filepath,
            ...cacheFilesPath[newFilePath],
          };
          break;
        case ".map":
          break;
        default:
          logger.warn(`Unknown file extension: ${ext}`);
          break;
      }
    },
  );

  // Generate cache file
  Object.entries(cacheFilesPath).forEach(([cacheFilePath, files]) => {
    const cacheFileMeta = files.meta
      ? JSON.parse(fs.readFileSync(files.meta, "utf8"))
      : undefined;
    const cacheFileContent = {
      type: files.body ? "route" : files.json ? "page" : "app",
      meta: cacheFileMeta,
      html: files.html ? fs.readFileSync(files.html, "utf8") : undefined,
      json: files.json
        ? JSON.parse(fs.readFileSync(files.json, "utf8"))
        : undefined,
      rsc: files.rsc ? fs.readFileSync(files.rsc, "utf8") : undefined,
      body: files.body
        ? fs
            .readFileSync(files.body)
            .toString(
              isBinaryContentType(cacheFileMeta.headers["content-type"])
                ? "base64"
                : "utf8",
            )
        : undefined,
    };
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheFileContent));
  });

  if (!config.dangerous?.disableTagCache) {
    // Generate dynamodb data
    // We need to traverse the cache to find every .meta file
    const metaFiles: {
      tag: { S: string };
      path: { S: string };
      revalidatedAt: { N: string };
    }[] = [];

    // Compute dynamodb cache data
    // Traverse files inside cache to find all meta files and cache tags associated with them
    buildHelper.traverseFiles(
      outputPath,
      (file) => file.endsWith(".meta"),
      (filePath) => {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const fileData = JSON.parse(fileContent);
        if (fileData.headers?.["x-next-cache-tags"]) {
          fileData.headers["x-next-cache-tags"]
            .split(",")
            .forEach((tag: string) => {
              // TODO: We should split the tag using getDerivedTags from next.js or maybe use an in house implementation
              metaFiles.push({
                tag: { S: path.posix.join(buildId, tag.trim()) },
                path: {
                  S: path.posix.join(
                    buildId,
                    path.relative(outputPath, filePath).replace(".meta", ""),
                  ),
                },
                // We don't care about the revalidation time here, we just need to make sure it's there
                revalidatedAt: { N: "1" },
              });
            });
        }
      },
    );

    // Copy fetch-cache to cache folder
    const fetchCachePath = path.join(
      appBuildOutputPath,
      ".next/cache/fetch-cache",
    );
    if (fs.existsSync(fetchCachePath)) {
      const fetchOutputPath = path.join(outputDir, "cache", "__fetch", buildId);
      fs.mkdirSync(fetchOutputPath, { recursive: true });
      fs.cpSync(fetchCachePath, fetchOutputPath, { recursive: true });

      buildHelper.traverseFiles(
        fetchCachePath,
        () => true,
        (filepath) => {
          const fileContent = fs.readFileSync(filepath, "utf8");
          const fileData = JSON.parse(fileContent);
          fileData?.tags?.forEach((tag: string) => {
            metaFiles.push({
              tag: { S: path.posix.join(buildId, tag) },
              path: {
                S: path.posix.join(
                  buildId,
                  path.relative(fetchCachePath, filepath),
                ),
              },
              revalidatedAt: { N: "1" },
            });
          });
        },
      );
    }

    if (metaFiles.length > 0) {
      const providerPath = path.join(outputDir, "dynamodb-provider");

      await buildHelper.esbuildAsync(
        {
          external: ["@aws-sdk/client-dynamodb"],
          entryPoints: [path.join(__dirname, "adapters", "dynamo-provider.js")],
          outfile: path.join(providerPath, "index.mjs"),
          target: ["node18"],
          plugins: [
            openNextResolvePlugin({
              fnName: "initializationFunction",
              overrides: {
                converter:
                  config.initializationFunction?.override?.converter ?? "dummy",
                wrapper: config.initializationFunction?.override?.wrapper,
              },
            }),
          ],
        },
        options,
      );

      //Copy open-next.config.mjs into the bundle
      buildHelper.copyOpenNextConfig(options.buildDir, providerPath);

      // TODO: check if metafiles doesn't contain duplicates
      fs.writeFileSync(
        path.join(providerPath, "dynamodb-cache.json"),
        JSON.stringify(metaFiles),
      );
    }
  }

  // We need to remove files later because we need the metafiles for dynamodb tags cache
  buildHelper.removeFiles(outputPath, (file) => !file.endsWith(".cache"));
}

/***************************/
/* Server Helper Functions */
/***************************/
