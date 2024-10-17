import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import {
  build as buildAsync,
  BuildOptions as ESBuildOptions,
  buildSync,
} from "esbuild";
import { OpenNextConfig } from "types/open-next.js";

import logger from "../logger.js";

const require = createRequire(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export type BuildOptions = ReturnType<typeof normalizeOptions>;

export function normalizeOptions(
  config: OpenNextConfig,
  distDir: string,
  tempBuildDir: string,
) {
  const appPath = path.join(process.cwd(), config.appPath || ".");
  const buildOutputPath = path.join(
    process.cwd(),
    config.buildOutputPath || ".",
  );
  const outputDir = path.join(buildOutputPath, ".open-next");

  const { root: monorepoRoot, packager } = findMonorepoRoot(
    path.join(process.cwd(), config.appPath || "."),
  );

  let appPackageJsonPath: string;
  if (config.packageJsonPath) {
    const _pkgPath = path.join(process.cwd(), config.packageJsonPath);
    appPackageJsonPath = _pkgPath.endsWith("package.json")
      ? _pkgPath
      : path.join(_pkgPath, "./package.json");
  } else {
    appPackageJsonPath = findNextPackageJsonPath(appPath, monorepoRoot);
  }

  return {
    appBuildOutputPath: buildOutputPath,
    appPackageJsonPath,
    appPath,
    appPublicPath: path.join(appPath, "public"),
    buildDir: path.join(outputDir, ".build"),
    config,
    debug: Boolean(process.env.OPEN_NEXT_DEBUG) ?? false,
    monorepoRoot,
    nextVersion: getNextVersion(appPath),
    openNextVersion: getOpenNextVersion(),
    openNextDistDir: distDir,
    outputDir,
    packager,
    tempBuildDir,
  };
}

function findMonorepoRoot(appPath: string) {
  let currentPath = appPath;
  while (currentPath !== "/") {
    const found = [
      { file: "package-lock.json", packager: "npm" as const },
      { file: "yarn.lock", packager: "yarn" as const },
      { file: "pnpm-lock.yaml", packager: "pnpm" as const },
      { file: "bun.lockb", packager: "bun" as const },
    ].find((f) => fs.existsSync(path.join(currentPath, f.file)));

    if (found) {
      if (currentPath !== appPath) {
        logger.info("Monorepo detected at", currentPath);
      }
      return { root: currentPath, packager: found.packager };
    }
    currentPath = path.dirname(currentPath);
  }

  // note: a lock file (package-lock.json, yarn.lock, or pnpm-lock.yaml) is
  //       not found in the app's directory or any of its parent directories.
  //       We are going to assume that the app is not part of a monorepo.
  logger.warn("No lockfile found");
  return { root: appPath, packager: "npm" as const };
}

function findNextPackageJsonPath(appPath: string, root: string) {
  // This is needed for the case where the app is a single-version monorepo and the package.json is in the root of the monorepo
  return fs.existsSync(path.join(appPath, "./package.json"))
    ? path.join(appPath, "./package.json")
    : path.join(root, "./package.json");
}

export function esbuildSync(
  esbuildOptions: ESBuildOptions,
  options: BuildOptions,
) {
  const { openNextVersion, debug } = options;
  const result = buildSync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify: debug ? false : true,
    mainFields: ["module", "main"],
    sourcemap: debug ? "inline" : false,
    sourcesContent: false,
    ...esbuildOptions,
    external: ["./open-next.config.mjs", ...(esbuildOptions.external ?? [])],
    banner: {
      ...esbuildOptions.banner,
      js: [
        esbuildOptions.banner?.js || "",
        `globalThis.openNextDebug = ${debug};`,
        `globalThis.openNextVersion = "${openNextVersion}";`,
      ].join(""),
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => logger.error(error));
    throw new Error(
      `There was a problem bundling ${
        (esbuildOptions.entryPoints as string[])[0]
      }.`,
    );
  }
}

export async function esbuildAsync(
  esbuildOptions: ESBuildOptions,
  options: BuildOptions,
) {
  const { openNextVersion, debug } = options;
  const result = await buildAsync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify: debug ? false : true,
    mainFields: ["module", "main"],
    sourcemap: debug ? "inline" : false,
    sourcesContent: false,
    ...esbuildOptions,
    external: [
      ...(esbuildOptions.external ?? []),
      "next",
      "./open-next.config.mjs",
    ],
    banner: {
      ...esbuildOptions.banner,
      js: [
        esbuildOptions.banner?.js || "",
        `globalThis.openNextDebug = ${debug};`,
        `globalThis.openNextVersion = "${openNextVersion}";`,
      ].join(""),
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => logger.error(error));
    throw new Error(
      `There was a problem bundling ${
        (esbuildOptions.entryPoints as string[])[0]
      }.`,
    );
  }
}

export function removeFiles(
  root: string,
  conditionFn: (file: string) => boolean,
  searchingDir: string = "",
) {
  traverseFiles(
    root,
    conditionFn,
    (filePath) => fs.rmSync(filePath, { force: true }),
    searchingDir,
  );
}

/**
 * Recursively traverse files in a directory and call `callbackFn` when `conditionFn` returns true
 * @param root - Root directory to search
 * @param conditionFn - Called to determine if `callbackFn` should be called
 * @param callbackFn - Called when `conditionFn` returns true
 * @param searchingDir - Directory to search (used for recursion)
 */
export function traverseFiles(
  root: string,
  conditionFn: (file: string) => boolean,
  callbackFn: (filePath: string) => void,
  searchingDir: string = "",
) {
  fs.readdirSync(path.join(root, searchingDir)).forEach((file) => {
    const filePath = path.join(root, searchingDir, file);

    if (fs.statSync(filePath).isDirectory()) {
      traverseFiles(
        root,
        conditionFn,
        callbackFn,
        path.join(searchingDir, file),
      );
      return;
    }

    if (conditionFn(path.join(searchingDir, file))) {
      callbackFn(filePath);
    }
  });
}

export function getHtmlPages(dotNextPath: string) {
  // Get a list of HTML pages
  //
  // sample return value:
  // Set([
  //   '404.html',
  //   'csr.html',
  //   'image-html-tag.html',
  // ])
  const manifestPath = path.join(
    dotNextPath,
    ".next/server/pages-manifest.json",
  );
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  return Object.entries(JSON.parse(manifest))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([_, value]) => (value as string).replace(/^pages\//, ""))
    .reduce((acc, page) => acc.add(page), new Set<string>());
}

export function getBuildId(dotNextPath: string) {
  return fs
    .readFileSync(path.join(dotNextPath, ".next/BUILD_ID"), "utf-8")
    .trim();
}

export function getOpenNextVersion(): string {
  return require(path.join(__dirname, "../../package.json")).version;
}

export function getNextVersion(appPath: string): string {
  // We cannot just require("next/package.json") because it could be executed in a different directory
  const nextPackageJsonPath = require.resolve("next/package.json", {
    paths: [appPath],
  });
  const version = require(nextPackageJsonPath)?.version;

  if (!version) {
    throw new Error("Failed to find Next version");
  }

  // Drop the -canary.n suffix
  return version.split("-")[0];
}

export function compareSemver(v1: string, v2: string): number {
  if (v1 === "latest") return 1;
  if (/^[^\d]/.test(v1)) {
    v1 = v1.substring(1);
  }
  if (/^[^\d]/.test(v2)) {
    v2 = v2.substring(1);
  }
  const [major1, minor1, patch1] = v1.split(".").map(Number);
  const [major2, minor2, patch2] = v2.split(".").map(Number);

  if (major1 !== major2) return major1 - major2;
  if (minor1 !== minor2) return minor1 - minor2;
  return patch1 - patch2;
}

export function copyOpenNextConfig(
  inputDir: string,
  outputDir: string,
  isEdge = false,
) {
  // Copy open-next.config.mjs
  fs.copyFileSync(
    path.join(
      inputDir,
      isEdge ? "open-next.config.edge.mjs" : "open-next.config.mjs",
    ),
    path.join(outputDir, "open-next.config.mjs"),
  );
}

export function copyEnvFile(
  appPath: string,
  packagePath: string,
  outputPath: string,
) {
  const baseAppPath = path.join(appPath, ".next/standalone", packagePath);
  const baseOutputPath = path.join(outputPath, packagePath);
  const envPath = path.join(baseAppPath, ".env");
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(baseOutputPath, ".env"));
  }
  const envProdPath = path.join(baseAppPath, ".env.production");
  if (fs.existsSync(envProdPath)) {
    fs.copyFileSync(envProdPath, path.join(baseOutputPath, ".env.production"));
  }
}

/**
 * Check we are in a Nextjs app by looking for the Nextjs config file.
 */
export function checkRunningInsideNextjsApp(options: BuildOptions) {
  const { appPath } = options;
  const extension = ["js", "cjs", "mjs", "ts"].find((ext) =>
    fs.existsSync(path.join(appPath, `next.config.${ext}`)),
  );
  if (!extension) {
    logger.error(
      "Error: next.config.js not found. Please make sure you are running this command inside a Next.js app.",
    );
    process.exit(1);
  }
}

export function printNextjsVersion(options: BuildOptions) {
  logger.info(`Next.js version : ${options.nextVersion}`);
}

export function printOpenNextVersion(options: BuildOptions) {
  logger.info(`OpenNext v${options.openNextVersion}`);
}

/**
 * Populates the build directory with the compiled configuration files.
 *
 * We need to get the build relative to the cwd to find the compiled config.
 * This is needed for the case where the app is a single-version monorepo
 * and the package.json is in the root of the monorepo where the build is in
 * the app directory, but the compiled config is in the root of the monorepo.
 */
export function initOutputDir(options: BuildOptions) {
  fs.rmSync(options.outputDir, { recursive: true, force: true });
  const { buildDir } = options;
  fs.mkdirSync(buildDir, { recursive: true });
  fs.cpSync(options.tempBuildDir, buildDir, { recursive: true });
}
