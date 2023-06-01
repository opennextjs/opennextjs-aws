import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import cp from "node:child_process";
import { minifyAll } from "./minimize-js.js";
import { buildSync, BuildOptions as ESBuildOptions } from "esbuild";
import { createRequire as topLevelCreateRequire } from "node:module";

interface BuildOptions {
  /**
   * Minify the server bundle.
   * @default false
   */
  minify?: boolean;
  /**
   * Print debug information.
   * @default false
   */
  debug?: boolean;
  /**
   * The command to build the Next.js app.
   * @default `npm run build`, `yarn build`, or `pnpm build` based on the lock file found in the app's directory or any of its parent directories.
   * @example
   * ```ts
   * build({
   *   buildCommand: "pnpm custom:build",
   * });
   * ```
   */
  buildCommand?: string;
}

const require = topLevelCreateRequire(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
let options: ReturnType<typeof normalizeOptions>;

export type PublicFiles = {
  files: string[];
};

export async function build(opts: BuildOptions = {}) {
  // Initialize options
  options = normalizeOptions(opts);

  // Pre-build validation
  checkRunningInsideNextjsApp();
  printNextjsVersion();
  printOpenNextVersion();
  const { root: monorepoRoot, packager } = findMonorepoRoot();

  // Build Next.js app
  printHeader("Building Next.js app");
  setStandaloneBuildMode(monorepoRoot);
  await buildNextjsApp(packager);

  // Generate deployable bundle
  printHeader("Generating bundle");
  initOutputDir();
  createAssets();
  createServerBundle(monorepoRoot);
  createImageOptimizationBundle();
  createWarmerBundle();
  if (options.minify) {
    await minifyServerBundle();
  }
}

function normalizeOptions(opts: BuildOptions) {
  const appPath = process.cwd();
  const outputDir = ".open-next";
  return {
    appPath,
    appPublicPath: path.join(appPath, "public"),
    outputDir,
    tempDir: path.join(outputDir, ".build"),
    minify: opts.minify ?? Boolean(process.env.OPEN_NEXT_MINIFY) ?? false,
    debug: opts.debug ?? Boolean(process.env.OPEN_NEXT_DEBUG) ?? false,
    buildCommand: opts.buildCommand,
  };
}

function checkRunningInsideNextjsApp() {
  const { appPath } = options;
  const extension = ["js", "cjs", "mjs"].find((ext) =>
    fs.existsSync(path.join(appPath, `next.config.${ext}`))
  );
  if (!extension) {
    console.error(
      "Error: next.config.js not found. Please make sure you are running this command inside a Next.js app."
    );
    process.exit(1);
  }
}

function findMonorepoRoot() {
  const { appPath } = options;
  let currentPath = appPath;
  while (currentPath !== "/") {
    const found = [
      { file: "package-lock.json", packager: "npm" as const },
      { file: "yarn.lock", packager: "yarn" as const },
      { file: "pnpm-lock.yaml", packager: "pnpm" as const },
    ].find((f) => fs.existsSync(path.join(currentPath, f.file)));

    if (found) {
      if (currentPath !== appPath) {
        console.info("Monorepo detected at", currentPath);
      }
      return { root: currentPath, packager: found.packager };
    }
    currentPath = path.dirname(currentPath);
  }

  // note: a lock file (package-lock.json, yarn.lock, or pnpm-lock.yaml) is
  //       not found in the app's directory or any of its parent directories.
  //       We are going to assume that the app is not part of a monorepo.
  return { root: appPath, packager: "npm" as const };
}

function setStandaloneBuildMode(monorepoRoot: string) {
  // Equivalent to setting `target: "standalone"` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = "true";
  // Equivalent to setting `experimental.outputFileTracingRoot` in next.config.js
  process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = monorepoRoot;
}

function buildNextjsApp(packager: "npm" | "yarn" | "pnpm") {
  const { appPath } = options;
  const command =
    options.buildCommand ??
    (packager === "npm" ? "npm run build" : `${packager} build`);
  cp.execSync(command, {
    stdio: "inherit",
    cwd: appPath,
  });
}

function printHeader(header: string) {
  header = `OpenNext — ${header}`;
  console.info(
    [
      "",
      "┌" + "─".repeat(header.length + 2) + "┐",
      `│ ${header} │`,
      "└" + "─".repeat(header.length + 2) + "┘",
      "",
    ].join("\n")
  );
}

function printNextjsVersion() {
  const { appPath } = options;
  cp.spawnSync(
    "node",
    [
      "-e",
      `"console.info('Next.js v' + require('next/package.json').version)"`,
    ],
    {
      stdio: "inherit",
      cwd: appPath,
      shell: true,
    }
  );
}

function printOpenNextVersion() {
  const onVersion = require(path.join(__dirname, "../package.json")).version;
  console.info(`OpenNext v${onVersion}`);
}

function injectMiddlewareGeolocation(outputPath: string, packagePath: string) {
  const basePath = path.join(outputPath, packagePath, ".next", "server");
  const rootMiddlewarePath = path.join(basePath, "middleware.js");
  const srcMiddlewarePath = path.join(basePath, "src", "middleware.js");
  if (fs.existsSync(rootMiddlewarePath)) {
    inject(rootMiddlewarePath);
  } else if (fs.existsSync(srcMiddlewarePath)) {
    inject(srcMiddlewarePath);
  }

  function inject(middlewarePath: string) {
    const content = fs.readFileSync(middlewarePath, "utf-8");
    fs.writeFileSync(
      middlewarePath,
      content.replace(
        "geo: init.geo || {}",
        `geo: init.geo || {
        country: this.headers.get("cloudfront-viewer-country"),
        countryName: this.headers.get("cloudfront-viewer-country-name"),
        region: this.headers.get("cloudfront-viewer-country-region"),
        regionName: this.headers.get("cloudfront-viewer-country-region-name"),
        city: this.headers.get("cloudfront-viewer-city"),
        postalCode: this.headers.get("cloudfront-viewer-postal-code"),
        timeZone: this.headers.get("cloudfront-viewer-time-zone"),
        latitude: this.headers.get("cloudfront-viewer-latitude"),
        longitude: this.headers.get("cloudfront-viewer-longitude"),
        metroCode: this.headers.get("cloudfront-viewer-metro-code"),
      }`
      )
    );
  }
}

function initOutputDir() {
  const { outputDir, tempDir } = options;
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function listPublicFiles() {
  const { appPublicPath } = options;
  const result: PublicFiles = { files: [] };

  if (!fs.existsSync(appPublicPath)) {
    return result;
  }

  function processDirectory(pathInPublic: string) {
    const files = fs.readdirSync(path.join(appPublicPath, pathInPublic), {
      withFileTypes: true,
    });

    for (const file of files) {
      file.isDirectory()
        ? processDirectory(path.join(pathInPublic, file.name))
        : result.files.push(path.posix.join(pathInPublic, file.name));
    }
  }

  processDirectory("/");
  return result;
}

function createServerBundle(monorepoRoot: string) {
  console.info(`Bundling server function...`);

  const { appPath, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "server-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy over standalone output files
  // note: if user uses pnpm as the package manager, node_modules contain
  //       symlinks. We don't want to resolve the symlinks when copying.
  fs.cpSync(path.join(appPath, ".next/standalone"), path.join(outputPath), {
    recursive: true,
    verbatimSymlinks: true,
  });

  // Resolve path to the Next.js app if inside the monorepo
  // note: if user's app is inside a monorepo, standalone mode places
  //       `node_modules` inside `.next/standalone`, and others inside
  //       `.next/standalone/package/path` (ie. `.next`, `server.js`).
  //       We need to output the handler file inside the package path.
  const isMonorepo = monorepoRoot !== appPath;
  const packagePath = path.relative(monorepoRoot, appPath);

  // Standalone output already has a Node server "server.js", remove it.
  // It will be replaced with the Lambda handler.
  fs.rmSync(path.join(outputPath, packagePath, "server.js"), { force: true });

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.
  esbuildSync({
    entryPoints: [path.join(__dirname, "adapters", "server-adapter.js")],
    external: ["next"],
    outfile: path.join(outputPath, packagePath, "index.mjs"),
    banner: {
      js: [
        "import { createRequire as topLevelCreateRequire } from 'module';",
        "const require = topLevelCreateRequire(import.meta.url);",
        "import bannerUrl from 'url';",
        "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
  });
  // note: in the monorepo case, the handler file is output to
  //       `.next/standalone/package/path/index.mjs`, but we want
  //       the Lambda function to be able to find the handler at
  //       the root of the bundle. We will create a dummy `index.mjs`
  //       that re-exports the real handler.
  if (isMonorepo) {
    // always use posix path for import path
    const packagePosixPath = packagePath.split(path.sep).join(path.posix.sep);
    fs.writeFileSync(
      path.join(outputPath, "index.mjs"),
      [`export * from "./${packagePosixPath}/index.mjs";`].join("")
    );
  }

  // Save a list of top level files in /public
  const outputOpenNextPath = path.join(outputPath, packagePath, ".open-next");
  fs.mkdirSync(outputOpenNextPath, { recursive: true });
  fs.writeFileSync(
    path.join(outputOpenNextPath, "public-files.json"),
    JSON.stringify(listPublicFiles())
  );

  // WORKAROUND: Set `NextRequest` geolocation data — https://github.com/serverless-stack/open-next#workaround-set-nextrequest-geolocation-data
  injectMiddlewareGeolocation(outputPath, packagePath);
}

function createWarmerBundle() {
  console.info(`Bundling warmer function...`);

  const { outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "warmer-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adatper relys on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.
  esbuildSync({
    entryPoints: [path.join(__dirname, "adapters", "warmer-function.js")],
    external: ["next"],
    outfile: path.join(outputPath, "index.mjs"),
    banner: {
      js: [
        "import { createRequire as topLevelCreateRequire } from 'module';",
        "const require = topLevelCreateRequire(import.meta.url);",
        "import bannerUrl from 'url';",
        "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
  });
}

async function minifyServerBundle() {
  console.info(`Minimizing server function...`);
  const { outputDir } = options;
  await minifyAll(path.join(outputDir, "server-function"), {
    compress_json: true,
    mangle: true,
  });
}

function createImageOptimizationBundle() {
  console.info(`Bundling image optimization function...`);

  const { appPath, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "image-optimization-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Build Lambda code (1st pass)
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "@aws-sdk/client-s3" package which is not a dependency in user's
  //       Next.js app.
  esbuildSync({
    entryPoints: [
      path.join(__dirname, "adapters", "image-optimization-adapter.js"),
    ],
    external: ["sharp", "next"],
    outfile: path.join(outputPath, "index.mjs"),
  });

  // Build Lambda code (2nd pass)
  // note: bundle in user's Next.js app again b/c the adapter relies on the
  //       "next" package. And the "next" package from user's app should
  //       be used.
  esbuildSync({
    entryPoints: [path.join(outputPath, "index.mjs")],
    external: ["sharp"],
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
  });

  // Copy over .next/required-server-files.json file
  fs.mkdirSync(path.join(outputPath, ".next"));
  fs.copyFileSync(
    path.join(appPath, ".next/required-server-files.json"),
    path.join(outputPath, ".next/required-server-files.json")
  );

  // Copy over sharp node modules
  fs.cpSync(
    path.join(__dirname, "../assets/sharp-node-modules"),
    path.join(outputPath, "node_modules"),
    { recursive: true }
  );
}

function createAssets() {
  console.info(`Bundling assets...`);

  const { appPath, appPublicPath, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "assets");
  fs.mkdirSync(outputPath, { recursive: true });

  // Next.js outputs assets into multiple files. Copy into the same directory.
  // Copy over:
  // - .next/BUILD_ID => _next/BUILD_ID
  // - .next/static   => _next/static
  // - public/*       => *
  fs.copyFileSync(
    path.join(appPath, ".next/BUILD_ID"),
    path.join(outputPath, "BUILD_ID")
  );
  fs.cpSync(
    path.join(appPath, ".next/static"),
    path.join(outputPath, "_next", "static"),
    { recursive: true }
  );
  if (fs.existsSync(appPublicPath)) {
    fs.cpSync(appPublicPath, outputPath, { recursive: true });
  }
}

function esbuildSync(esbuildOptions: ESBuildOptions) {
  const { debug } = options;
  const result = buildSync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify: debug ? false : true,
    sourcemap: debug ? "inline" : false,
    ...esbuildOptions,
    // "process.env.OPEN_NEXT_DEBUG" determines if the logger writes to console.log
    define: {
      ...esbuildOptions.define,
      "process.env.OPEN_NEXT_DEBUG": process.env.OPEN_NEXT_DEBUG
        ? "true"
        : "false",
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(
      `There was a problem bundling ${
        (esbuildOptions.entryPoints as string[])[0]
      }.`
    );
  }
}
