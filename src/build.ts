import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { buildSync, BuildOptions } from "esbuild";
// @ts-ignore @vercel/next does not provide types
import { build as nextBuild } from "@vercel/next";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const appPath = process.cwd();
const outputDir = ".open-next";
const tempDir = path.join(outputDir, ".build");

export async function build() {
  // Pre-build validation
  printVersion();
  checkRunningInsideNextjsApp();
  setStandaloneBuildMode();
  const monorepoRoot = findMonorepoRoot();

  // Build Next.js app
  printHeader("Building Next.js app");
  const buildOutput = await buildNextjsApp(monorepoRoot);

  // Generate deployable bundle
  printHeader("Generating bundle");
  initOutputDir();
  createServerBundle(monorepoRoot);
  createImageOptimizationBundle();
  createMiddlewareBundle(buildOutput);
  createAssets();
}

function checkRunningInsideNextjsApp() {
  if (!fs.existsSync(path.join(appPath, "next.config.js"))) {
    console.error("Error: next.config.js not found. Please make sure you are running this command inside a Next.js app.");
    process.exit(1);
  }
}

function findMonorepoRoot() {
  let currentPath = appPath;
  while (currentPath !== "/") {
    if (fs.existsSync(path.join(currentPath, "package-lock.json"))
      || fs.existsSync(path.join(currentPath, "yarn.lock"))
      || fs.existsSync(path.join(currentPath, "pnpm-lock.yaml"))) {
      if (currentPath !== appPath) {
        console.info("Monorepo detected at", currentPath);
      }
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  // note: a lock file (package-lock.json, yarn.lock, or pnpm-lock.yaml) is
  //       not found in the app's directory or any of its parent directories.
  //       We are going to assume that the app is not part of a monorepo.
  return appPath;
}

function setStandaloneBuildMode() {
  // Equivalent to setting `target: 'standalone'` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = "true";
}

function buildNextjsApp(monorepoRoot: string) {
  return nextBuild({
    files: [],
    repoRootPath: monorepoRoot,
    workPath: appPath,
    entrypoint: "next.config.js",
    config: {},
    meta: {},
  });
}

function printHeader(header: string) {
  header = `OpenNext — ${header}`;
  console.info([
    "",
    "┌" + "─".repeat(header.length + 2) + "┐",
    `│ ${header} │`,
    "└" + "─".repeat(header.length + 2) + "┘",
    "",
  ].join("\n"));
}

function printVersion() {
  const pathToPackageJson = path.join(__dirname, "../package.json");
  const pkg = JSON.parse(fs.readFileSync(pathToPackageJson, "utf-8"));
  console.info(`Using v${pkg.version}`);
}

function initOutputDir() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function isMiddlewareEnabled() {
  const filePath = path.join(appPath, ".next", "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json).sortedMiddleware.length > 0;
}

function createServerBundle(monorepoRoot: string) {
  console.info(`Bundling server function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy over standalone output files
  // note: if user uses pnpm as the package manager, node_modules contain
  //       symlinks. We don't want to resolve the symlinks when copying.
  fs.cpSync(
    path.join(appPath, ".next/standalone"),
    path.join(outputPath),
    { recursive: true, verbatimSymlinks: true }
  );

  // Resolve path to the Next.js app if inside the monorepo
  // note: if user's app is inside a monorepo, standalone mode places
  //       `node_modules` inside `.next/standalone`, and others inside
  //       `.next/standalone/package/path` (ie. `.next`, `server.js`).
  //       We need to output the handler file inside the package path.
  const isMonorepo = monorepoRoot !== appPath;
  const packagePath = path.relative(monorepoRoot, appPath);

  // Standalone output already has a Node server "server.js", remove it.
  // It will be replaced with the Lambda handler.
  fs.rmSync(
    path.join(outputPath, packagePath, "server.js"),
    { force: true }
  );

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adatper relys on the
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
        "import url from 'url';",
        "const __dirname = url.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
  });
  // note: in the monorepo case, the handler file is output to
  //       `.next/standalone/package/path/index.mjs`, but we want
  //       the Lambda function to be able to find the handler at
  //       the root of the bundle. We will create a dummy `index.mjs`
  //       that re-exports the real handler.
  if (isMonorepo) {
    fs.writeFileSync(path.join(outputPath, "index.mjs"), [
      `export * from "./${packagePath}/index.mjs";`,
    ].join(""))
  };
}

function createImageOptimizationBundle() {
  console.info(`Bundling image optimization function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "image-optimization-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Build Lambda code (1st pass)
  // note: bundle in OpenNext package b/c the adatper relys on the
  //       "@aws-sdk/client-s3" package which is not a dependency in user's
  //       Next.js app.
  esbuildSync({
    entryPoints: [path.join(__dirname, "adapters", "image-optimization-adapter.js")],
    external: ["sharp", "next"],
    outfile: path.join(outputPath, "index.mjs"),
  });

  // Build Lambda code (2nd pass)
  // note: bundle in user's Next.js app again b/c the adatper relys on the
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
        "import url from 'url';",
        "const __dirname = url.fileURLToPath(new URL('.', import.meta.url));",
      ].join("\n"),
    },
  });

  // Copy over .next/required-server-files.json file
  fs.mkdirSync(path.join(outputPath, ".next"));
  fs.copyFileSync(
    path.join(appPath, ".next/required-server-files.json"),
    path.join(outputPath, ".next/required-server-files.json"),
  );

  // Copy over sharp node modules
  fs.cpSync(
    path.join(__dirname, "../assets/sharp-node-modules"),
    path.join(outputPath, "node_modules"),
    { recursive: true }
  );
}

function createMiddlewareBundle(buildOutput: any) {
  if (isMiddlewareEnabled()) {
    console.info(`Bundling middleware edge function...`);
  }
  else {
    console.info(`Bundling middleware edge function... \x1b[36m%s\x1b[0m`, "skipped");
    return;
  }

  // Create output folder
  const outputPath = path.join(outputDir, "middleware-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Save middleware code to file
  const src: string = buildOutput.output.middleware.files["index.js"].data;
  fs.writeFileSync(path.join(tempDir, "middleware.js"), src);
  fs.copyFileSync(
    path.join(__dirname, "adapters", "middleware-adapter.js"),
    path.join(tempDir, "middleware-adapter.js"),
  );

  // Build Lambda code
  esbuildSync({
    entryPoints: [path.join(tempDir, "middleware-adapter.js")],
    outfile: path.join(outputPath, "index.mjs"),
    banner: {
      js: [
        // WORKAROUND: Add `Headers.getAll()` extension to the middleware function — https://github.com/serverless-stack/open-next#workaround-add-headersgetall-extension-to-the-middleware-function
        "class Response extends globalThis.Response {",
        "  constructor(body, init) {",
        "    super(body, init);",
        "    this.headers.getAll = (name) => {",
        "      name = name.toLowerCase();",
        "      if (name !== 'set-cookie') {",
        "        throw new Error('Headers.getAll is only supported for Set-Cookie');",
        "      }",
        "      return [...this.headers.entries()]",
        "        .filter(([key]) => key === name)",
        "        .map(([, value]) => value);",
        "    };",
        "  }",
        "}",
        // Polyfill Response and self
        "Object.assign(globalThis, {",
        "  Response,",
        "  self: {},",
        "});",
      ].join(""),
    },
  });
}

function createAssets() {
  console.info(`Bundling assets...`);

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
  fs.cpSync(
    path.join(appPath, "public"),
    outputPath,
    { recursive: true }
  );
}

function esbuildSync(options: BuildOptions) {
  const result = buildSync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    ...options,
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(`There was a problem bundling ${(options.entryPoints as string[])[0]}.`);
  }
}