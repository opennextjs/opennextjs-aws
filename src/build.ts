import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { buildSync } from "esbuild";
// @ts-ignore @vercel/next does not provide types
import { build as nextBuild } from "@vercel/next";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const appPath = process.cwd();
const outputDir = ".open-next";
const buildDir = path.join(outputDir, ".build");

export async function build() {
  // Pre-build validation
  checkRunningInsideNextjsApp();

  // Build Next.js app
  setStandaloneBuildMode();
  const buildOutput = await buildNextjsApp();

  // Generate deployable bundle
  printHeader("Generating OpenNext bundle");
  cleanupOutputDir();
  copyAdapterFiles();
  createServerBundle();
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

function setStandaloneBuildMode() {
  // Equivalent to setting `target: 'standalone'` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = "true";
}

function buildNextjsApp() {
  return nextBuild({
    files: [],
    workPath: appPath,
    entrypoint: "next.config.js",
    config: {},
    meta: {},
  });
}

function printHeader(header: string) {
  console.log([
    "┌" + "─".repeat(header.length + 2) + "┐",
    `│ ${header} │`,
    "└" + "─".repeat(header.length + 2) + "┘",
  ].join("\n"));
}

function cleanupOutputDir() {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

function isMiddlewareEnabled() {
  const filePath = path.join(appPath, ".next", "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json).sortedMiddleware.length > 0;
}

function copyAdapterFiles() {
  fs.cpSync(
    path.join(__dirname, "adapters"),
    path.join(buildDir),
    { recursive: true }
  );
}

function createServerBundle() {
  console.debug(`Bundling server function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy over standalone output files
  fs.cpSync(
    path.join(appPath, ".next/standalone"),
    path.join(outputPath),
    { recursive: true }
  );

  // Standalone output already has a Node server "server.js", remove it.
  // It will be replaced with the Lambda handler.
  fs.rmSync(
    path.join(outputPath, "server.js"),
    { force: true }
  );

  // Build Lambda code
  const result = buildSync({
    entryPoints: [path.join(buildDir, "server-adapter.js")],
    target: "esnext",
    format: "esm",
    platform: "node",
    external: ["next"],
    bundle: true,
    outfile: path.join(outputPath, "index.mjs"),
    banner: {
      js: [
        "import { createRequire as topLevelCreateRequire } from 'module';",
        "const require = topLevelCreateRequire(import.meta.url);",
        "import url from 'url';",
        "const __dirname = url.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(`There was a problem bundling the server handler.`);
  }
}

function createImageOptimizationBundle() {
  console.debug(`Bundling image optimization function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "image-optimization-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Build Lambda code
  const result = buildSync({
    entryPoints: [path.join(buildDir, "image-optimization-adapter.js")],
    target: "esnext",
    format: "esm",
    platform: "node",
    external: ["sharp"],
    metafile: true,
    bundle: true,
    write: true,
    allowOverwrite: true,
    outfile: path.join(outputPath, "index.mjs"),
    banner: {
      js: [
        "import { createRequire as topLevelCreateRequire } from 'module';",
        "const require = topLevelCreateRequire(import.meta.url);",
        "import url from 'url';",
        "const __dirname = url.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
  });
  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(`There was a problem bundling the image optimization handler.`);
  }

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
    console.debug(`Bundling middleware edge function...`);
  }
  else {
    console.debug(`Bundling middleware edge function... \x1b[36m%s\x1b[0m`, "skipped");
    return;
  }

  // Create output folder
  const outputPath = path.join(outputDir, "middleware-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Save middleware code to file
  const src: string = buildOutput.output.middleware.files["index.js"].data;
  fs.writeFileSync(path.join(buildDir, "middleware.js"), src);

  // Build Lambda code
  const result = buildSync({
    entryPoints: [path.join(buildDir, "middleware-adapter.js")],
    target: "esnext",
    format: "esm",
    platform: "node",
    metafile: true,
    bundle: true,
    write: true,
    allowOverwrite: true,
    outfile: path.join(outputPath, "index.mjs"),
  });
  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(`There was a problem bundling the middleware handler.`);
  }
}

function createAssets() {
  console.debug(`Bundling assets...`);

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