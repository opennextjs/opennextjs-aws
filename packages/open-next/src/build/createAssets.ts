import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "config/util.js";
import { safeParseJsonFile } from "utils/safe-json-parse.js";
import logger from "../logger.js";
import type { TagCacheMetaFile } from "../types/cache.js";
import { isBinaryContentType } from "../utils/binary.js";
import { CACHE_TAGS_HEADER } from "../utils/cacheHeaders.js";
import * as buildHelper from "./helper.js";

type CacheArtifactFiles = {
  meta?: string;
  html?: string;
  json?: string;
  rsc?: string;
  body?: string;
};

type CacheArtifact = {
  /** Path-based key used by Next.js versions without route-scoped metadata. */
  legacyKey: string;
  files: CacheArtifactFiles;
};

/**
 * Resolves an opaque response cache key inside the build cache output.
 *
 * Next.js owns the format of scoped keys. OpenNext only removes the leading
 * separator needed by cache APIs and verifies that the resulting filesystem
 * path cannot escape the cache output directory.
 *
 * @param outputCachePath Absolute cache output directory.
 * @param cacheKey Opaque key supplied by Next.js, or a legacy relative key.
 * @returns Absolute path of the serialized OpenNext cache entry.
 * @throws When the cache key resolves outside the cache output directory.
 */
export function resolveCacheFilePath(
  outputCachePath: string,
  cacheKey: string,
): string {
  const outputRoot = path.resolve(outputCachePath);
  const relativeKey = cacheKey.replace(/^[/\\]+/, "");
  const cacheFilePath = path.resolve(outputRoot, `${relativeKey}.cache`);
  if (
    cacheFilePath !== outputRoot &&
    !cacheFilePath.startsWith(`${outputRoot}${path.sep}`)
  ) {
    throw new Error(`Cache key resolves outside the cache output: ${cacheKey}`);
  }
  return cacheFilePath;
}

/**
 * Copy the static assets to the output folder
 *
 * WARNING: `useBasePath` should be set to `false` when the output file is used.
 *
 * @param options OpenNext build options
 * @param useBasePath whether to copy files into the to Next.js configured basePath
 */
export function createStaticAssets(
  options: buildHelper.BuildOptions,
  { useBasePath = false } = {},
) {
  logger.info("Bundling static assets...");

  const { appBuildOutputPath, appPublicPath, outputDir, appPath } = options;

  const nextConfig = loadConfig(path.join(appBuildOutputPath, ".next"));
  const basePath = useBasePath ? (nextConfig.basePath ?? "") : "";

  // Create output folder
  const outputPath = path.join(outputDir, "assets", basePath);
  fs.mkdirSync(outputPath, { recursive: true });

  /**
   * Next.js outputs assets into multiple files.
   *
   * Copy into the same directory:
   * - `.open-next/assets` when `useBasePath` is `false`
   * - `.open-next/assets/basePath` when `useBasePath` is `true`
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
    fs.cpSync(appPublicPath, outputPath, {
      recursive: true,
      dereference: true,
    });
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
 * @returns Whether the tag cache is used, and the meta files collected.
 */
export function createCacheAssets(options: buildHelper.BuildOptions) {
  logger.info("Bundling cache assets...");

  const { appBuildOutputPath, outputDir } = options;
  const packagePath = buildHelper.getPackagePath(options);
  const buildId = buildHelper.getBuildId(options);
  const nextConfig = loadConfig(path.join(appBuildOutputPath, ".next"));
  const openNextBuildId = nextConfig.deploymentId ?? buildId;

  let useTagCache = false;

  const dotNextPath = path.join(
    appBuildOutputPath,
    ".next/standalone",
    packagePath,
  );

  const outputCachePath = path.join(outputDir, "cache", openNextBuildId);
  fs.mkdirSync(outputCachePath, { recursive: true });

  const sourceDirs = [
    { directory: ".next/server/pages", cachePrefix: "" },
    { directory: ".next/server/app", cachePrefix: "" },
    // Adapter builds on fixed Next.js releases can emit prerenders directly
    // under their opaque response-cache key. Keep the route-cache directory
    // in the OpenNext key instead of treating it as a traversal root.
    { directory: ".next/server/route-cache", cachePrefix: "route-cache" },
  ]
    .map(({ directory, cachePrefix }) => ({
      directory: path.join(dotNextPath, directory),
      cachePrefix,
    }))
    .filter(({ directory }) => fs.existsSync(directory));

  const htmlPages = buildHelper.getHtmlPages(dotNextPath);

  const isFileSkipped = (relativePath: string) =>
    relativePath.endsWith(".js") ||
    relativePath.endsWith(".js.nft.json") ||
    // We skip manifest files as well
    relativePath.endsWith("-manifest.json") ||
    // We skip the segment rsc files as they are treated in a different way
    relativePath.endsWith(".segment.rsc") ||
    (relativePath.endsWith(".html") && htmlPages.has(relativePath));

  // Merge cache files into a single file
  const cacheArtifacts: Record<string, CacheArtifact> = {};

  // Build-time tags must point at the same opaque key used by runtime reads
  // and writes. Populating them while serializing each artifact avoids a
  // second pathname-based traversal that would discard route ownership.
  const metaFiles: TagCacheMetaFile[] = [];

  // Process each source directory
  sourceDirs.forEach(({ directory: sourceDir, cachePrefix }) => {
    buildHelper.traverseFiles(
      sourceDir,
      ({ relativePath }) =>
        !isFileSkipped(path.join(cachePrefix, relativePath)),
      ({ absolutePath, relativePath }) => {
        const ext = path.extname(absolutePath);
        switch (ext) {
          case ".meta":
          case ".html":
          case ".json":
          case ".body":
          case ".rsc": {
            // Stripping `.prefetch` maps both `<page>.rsc` and `<page>.prefetch.rsc` onto
            // the same cache entry, so the `rsc` field can hold either payload. When both
            // files exist the first one traversed wins, as the spread below keeps the value
            // already recorded for that extension.
            //
            // Next 16.1 removed `.prefetch.rsc`, so the strip is a no-op on Next 16 where
            // the `rsc` field always holds a full payload.
            const relativeCachePath = path
              .join(cachePrefix, relativePath)
              .slice(0, -ext.length)
              .replace(/\.prefetch$/, "")
              .split(path.sep)
              .join(path.posix.sep);
            // Keep source trees separate until metadata has supplied the final
            // key. Two source routes may intentionally have the same pathname.
            const artifactId = `${sourceDir}:${relativeCachePath}`;

            cacheArtifacts[artifactId] = {
              legacyKey: relativeCachePath,
              files: {
                [ext.slice(1)]: absolutePath,
                ...cacheArtifacts[artifactId]?.files,
              },
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
  });

  // Generate cache file
  Object.values(cacheArtifacts).forEach(({ legacyKey, files }) => {
    const cacheFileMeta = files.meta
      ? safeParseJsonFile(fs.readFileSync(files.meta, "utf8"), files.meta)
      : undefined;
    // Next.js 16.3.8+ records the exact opaque key and source owner in every
    // historical prerender seed. Runtime cache handlers are only queried with
    // this scoped key, so publishing the seed under its old pathname would
    // either make it unreachable or reintroduce cross-route cache collisions.
    const cacheKey = cacheFileMeta?.routeCache?.key ?? legacyKey;
    let cacheFilePath: string;
    try {
      cacheFilePath = resolveCacheFilePath(outputCachePath, cacheKey);
    } catch (error) {
      logger.warn(String(error));
      return;
    }
    const cacheJson = files.json
      ? safeParseJsonFile(fs.readFileSync(files.json, "utf8"), cacheFilePath)
      : undefined;
    if ((files.meta && !cacheFileMeta) || (files.json && !cacheJson)) {
      logger.warn(`Skipping invalid cache file: ${cacheFilePath}`);
      return;
    }

    // If we have a meta file, and it contains segmentPaths, we need to add them to the cache file
    const segments: Record<string, string> = Array.isArray(
      cacheFileMeta?.segmentPaths,
    )
      ? Object.fromEntries(
          cacheFileMeta!.segmentPaths.map((segmentPath: string) => {
            const absoluteSegmentPath = path.join(
              files.meta!.replace(/\.meta$/, ".segments"),
              `${segmentPath}.segment.rsc`,
            );
            const segmentContent = fs.readFileSync(absoluteSegmentPath, "utf8");
            return [segmentPath, segmentContent];
          }),
        )
      : {};

    const cacheFileContent = {
      type: files.body ? "route" : files.json ? "page" : "app",
      meta: cacheFileMeta,
      html: files.html ? fs.readFileSync(files.html, "utf8") : undefined,
      json: cacheJson,
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
      segmentData: Object.keys(segments).length > 0 ? segments : undefined,
    };

    // Ensure directory exists before writing
    fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheFileContent));

    if (
      !options.config.dangerous?.disableTagCache &&
      cacheFileMeta?.headers?.[CACHE_TAGS_HEADER]
    ) {
      cacheFileMeta.headers[CACHE_TAGS_HEADER]
        .split(",")
        .forEach((tag: string) => {
          metaFiles.push({
            tag: { S: path.posix.join(buildId, tag.trim()) },
            path: { S: path.posix.join(buildId, cacheKey) },
            revalidatedAt: { N: "1" },
          });
        });
    }
  });

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
        const fileData = safeParseJsonFile(fileContent, absolutePath);
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
    if (metaFiles.length > 0) {
      useTagCache = true;
      const providerPath = path.join(outputDir, "dynamodb-provider");

      // Copy open-next.config.mjs into the bundle
      fs.mkdirSync(providerPath, { recursive: true });
      buildHelper.copyOpenNextConfig(options.buildDir, providerPath);

      // TODO: check if metafiles doesn't contain duplicates
      fs.writeFileSync(
        path.join(providerPath, "dynamodb-cache.json"),
        JSON.stringify(metaFiles),
      );
    }
  }

  return { useTagCache, metaFiles };
}
