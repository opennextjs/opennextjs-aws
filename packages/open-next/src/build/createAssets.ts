import fs from "node:fs";
import path from "node:path";

import logger from "../logger.js";
import { isBinaryContentType } from "../utils/binary.js";
import * as buildHelper from "./helper.js";

export function createStaticAssets(options: buildHelper.BuildOptions) {
  logger.info("Bundling static assets...");

  const { appBuildOutputPath, appPublicPath, outputDir, appPath } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "assets");
  fs.mkdirSync(outputPath, { recursive: true });

  /**
   * Next.js outputs assets into multiple files. Copy into the same directory.
   *
   * Copy over:
   * - .next/BUILD_ID => BUILD_ID
   * - .next/static   => _next/static
   * - public/*       => *
   * - app/favicon.ico or src/app/favicon.ico  => favicon.ico
   *
   * Note: BUILD_ID is used by the SST infra.
   */
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

  // We need to check if the favicon is either a file or directory.
  // If it's a directory, we assume it's a route handler and ignore it.
  if (fs.existsSync(faviconPath) && fs.lstatSync(faviconPath).isFile()) {
    fs.copyFileSync(faviconPath, path.join(outputPath, "favicon.ico"));
  }
}

/**
 * Create the cache assets.
 *
 * @param options Build options.
 * @returns Whether tag cache is used.
 */
export function createCacheAssets(options: buildHelper.BuildOptions) {
  logger.info("Bundling cache assets...");

  const { appBuildOutputPath, outputDir } = options;
  const packagePath = buildHelper.getPackagePath(options);
  const buildId = buildHelper.getBuildId(options);
  let useTagCache = false;

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
    ({ relativePath }) =>
      relativePath.endsWith(".js") ||
      relativePath.endsWith(".js.nft.json") ||
      (relativePath.endsWith(".html") && htmlPages.has(relativePath)),
  );

  // Merge cache files into a single file
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
    ({ absolutePath }) => {
      const ext = path.extname(absolutePath);
      switch (ext) {
        case ".meta":
        case ".html":
        case ".json":
        case ".body":
        case ".rsc": {
          const newFilePath = absolutePath
            .substring(0, absolutePath.length - ext.length)
            .replace(/\.prefetch$/, "")
            .concat(".cache");

          cacheFilesPath[newFilePath] = {
            [ext.slice(1)]: absolutePath,
            ...cacheFilesPath[newFilePath],
          };
          break;
        }
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

  // We need to traverse the cache to find every .meta file
  const metaFiles: {
    tag: { S: string };
    path: { S: string };
    revalidatedAt: { N: string };
  }[] = [];

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
      ({ absolutePath, relativePath }) => {
        const fileContent = fs.readFileSync(absolutePath, "utf8");
        const fileData = JSON.parse(fileContent);
        fileData?.tags?.forEach((tag: string) => {
          metaFiles.push({
            tag: { S: path.posix.join(buildId, tag) },
            path: {
              S: path.posix.join(buildId, relativePath),
            },
            revalidatedAt: { N: "1" },
          });
        });
      },
    );
  }

  if (!options.config.dangerous?.disableTagCache) {
    // Compute dynamodb cache data
    // Traverse files inside cache to find all meta files and cache tags associated with them
    buildHelper.traverseFiles(
      outputPath,
      ({ absolutePath }) => absolutePath.endsWith(".meta"),
      ({ absolutePath, relativePath }) => {
        const fileContent = fs.readFileSync(absolutePath, "utf8");
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
                    relativePath.replace(".meta", ""),
                  ),
                },
                // We don't care about the revalidation time here, we just need to make sure it's there
                revalidatedAt: { N: "1" },
              });
            });
        }
      },
    );

    if (metaFiles.length > 0) {
      useTagCache = true;
      const providerPath = path.join(outputDir, "dynamodb-provider");

      //Copy open-next.config.mjs into the bundle
      fs.mkdirSync(providerPath, { recursive: true });
      buildHelper.copyOpenNextConfig(options.buildDir, providerPath);

      // TODO: check if metafiles doesn't contain duplicates
      fs.writeFileSync(
        path.join(providerPath, "dynamodb-cache.json"),
        JSON.stringify(metaFiles),
      );
    }
  }

  // We need to remove files later because we need the metafiles for dynamodb tags cache
  buildHelper.removeFiles(
    outputPath,
    ({ relativePath }) => !relativePath.endsWith(".cache"),
  );

  return { useTagCache };
}
