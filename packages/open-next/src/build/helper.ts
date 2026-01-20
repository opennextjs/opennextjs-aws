import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import type { BuildOptions as ESBuildOptions } from "esbuild";
import { build as buildAsync, buildSync } from "esbuild";
import type {
  DefaultOverrideOptions,
  OpenNextConfig,
} from "types/open-next.js";

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

  const { root: monorepoRoot, packager } = findPmAndMonorepoRoot(
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

  const debug = Boolean(process.env.OPEN_NEXT_DEBUG) ?? false;

  return {
    appBuildOutputPath: buildOutputPath,
    appPackageJsonPath,
    appPath,
    appPublicPath: path.join(appPath, "public"),
    buildDir: path.join(outputDir, ".build"),
    config,
    debug,
    // Whether ESBuild should minify the code
    minify: !debug,
    monorepoRoot,
    nextVersion: getNextVersion(appPath),
    openNextVersion: getOpenNextVersion(),
    openNextDistDir: distDir,
    outputDir,
    packager,
    tempBuildDir,
  };
}
/**
 * Given the path to a project this function detects the project's repository root (whether the project is in a simple
 * repository or a monorepo) as well as the package manager being used.
 *
 * @param appPath The project's path
 * @returns An object containing the root of the project's repo/monorepo as well as the package manager that it uses.
 */
export function findPmAndMonorepoRoot(appPath: string): { root: string, packager: 'npm'|'pnpm'|'yarn'|'bun' } {
  let currentPath = appPath;
  while (currentPath !== "/") {
    const found = [
      // bun can generate yaml lock files (`bun install --yarn`) so bun should be before yarn
      { file: "bun.lockb", packager: "bun" as const },
      { file: "bun.lock", packager: "bun" as const },
      { file: "package-lock.json", packager: "npm" as const },
      { file: "yarn.lock", packager: "yarn" as const },
      { file: "pnpm-lock.yaml", packager: "pnpm" as const },
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
  const { openNextVersion, debug, minify } = options;
  const result = buildSync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify,
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
  const { openNextVersion, debug, minify } = options;
  // Dump ESBuild build metadata to file in debug mode
  const metafile = debug && esbuildOptions.outfile !== undefined;
  const result = await buildAsync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify,
    metafile,
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

  if (result.metafile) {
    const metaFile = `${esbuildOptions.outfile}.meta.json`;
    fs.writeFileSync(metaFile, JSON.stringify(result.metafile, null, 2));
  }
}

/**
 *  Type of the parameter of `traverseFiles` callbacks
 */
export type TraversePath = {
  absolutePath: string;
  relativePath: string;
};

/**
 * Recursively traverse files in a directory and call `callbackFn` when `conditionFn` returns true
 *
 * The callbacks are passed both the absolute and relative (to root) path to files.
 *
 * @param root - Root directory to search
 * @param conditionFn - Called to determine if `callbackFn` should be called.
 * @param callbackFn - Called when `conditionFn` returns true.
 * @param searchingDir - Directory to search (used for recursion)
 */
export function traverseFiles(
  root: string,
  conditionFn: (paths: TraversePath) => boolean,
  callbackFn: (paths: TraversePath) => void,
  searchingDir = "",
) {
  fs.readdirSync(path.join(root, searchingDir)).forEach((file) => {
    const relativePath = path.join(searchingDir, file);
    const absolutePath = path.join(root, relativePath);

    if (fs.statSync(absolutePath).isDirectory()) {
      traverseFiles(root, conditionFn, callbackFn, relativePath);
      return;
    }

    if (conditionFn({ absolutePath, relativePath })) {
      callbackFn({ absolutePath, relativePath });
    }
  });
}

/**
 * Recursively delete files.
 *
 * @see `traverseFiles`.
 *
 * @param root Root directory to search.
 * @param conditionFn Predicate used to delete the files.
 */
export function removeFiles(
  root: string,
  conditionFn: (paths: TraversePath) => boolean,
) {
  traverseFiles(root, conditionFn, ({ absolutePath }) =>
    fs.rmSync(absolutePath, { force: true }),
  );
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

export function getBuildId(options: BuildOptions) {
  return fs
    .readFileSync(
      path.join(options.appBuildOutputPath, ".next/BUILD_ID"),
      "utf-8",
    )
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

export type SemverOp = "=" | ">=" | "<=" | ">" | "<";

/**
 * Compare two semver versions.
 *
 * @param v1 - First version. Can be "latest", otherwise it should be a valid semver version in the format of `major.minor.patch`. Usually is the next version from the package.json without canary suffix. If minor or patch are missing, they are considered 0.
 * @param v2 - Second version. Should not be "latest", it should be a valid semver version in the format of `major.minor.patch`. If minor or patch are missing, they are considered 0.
 * @example
 *     compareSemver("2.0.0", ">=", "1.0.0") === true
 */
export function compareSemver(
  v1: string,
  operator: SemverOp,
  v2: string,
): boolean {
  // - = 0 when versions are equal
  // - > 0 if v1 > v2
  // - < 0 if v2 > v1
  let versionDiff = 0;
  if (v1 === "latest") {
    versionDiff = 1;
  } else {
    if (/^[^\d]/.test(v1)) {
      // biome-ignore lint/style/noParameterAssign:
      v1 = v1.substring(1);
    }
    if (/^[^\d]/.test(v2)) {
      // biome-ignore lint/style/noParameterAssign:
      v2 = v2.substring(1);
    }
    const [major1, minor1 = 0, patch1 = 0] = v1.split(".").map(Number);
    const [major2, minor2 = 0, patch2 = 0] = v2.split(".").map(Number);
    if (Number.isNaN(major1) || Number.isNaN(major2)) {
      throw new Error("The major version is required.");
    }

    if (major1 !== major2) {
      versionDiff = major1 - major2;
    } else if (minor1 !== minor2) {
      versionDiff = minor1 - minor2;
    } else if (patch1 !== patch2) {
      versionDiff = patch1 - patch2;
    }
  }

  switch (operator) {
    case "=":
      return versionDiff === 0;
    case ">=":
      return versionDiff >= 0;
    case "<=":
      return versionDiff <= 0;
    case ">":
      return versionDiff > 0;
    case "<":
      return versionDiff < 0;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
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

/**
 * @returns Whether the edge runtime is used
 */
export async function isEdgeRuntime(
  overrides: DefaultOverrideOptions | undefined,
) {
  if (!overrides?.wrapper) {
    return false;
  }
  if (typeof overrides.wrapper === "string") {
    return ["cloudflare-edge", "cloudflare", "cloudflare-node"].includes(
      overrides.wrapper,
    );
  }
  return (await overrides?.wrapper?.())?.edgeRuntime;
}

export function getPackagePath(options: BuildOptions) {
  return path.relative(options.monorepoRoot, options.appBuildOutputPath);
}
