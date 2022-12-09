import fs from "fs";
import url from "url";
import path from "path";
import { buildSync } from "esbuild";
// @ts-ignore @vercel/next does not provide types
import { build as nextBuild } from "@vercel/next";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const appPath = process.cwd();
const outputDir = ".open-next";

export async function build() {
  // Check running inside Next.js app
  if (!fs.existsSync(path.join(appPath, "next.config.js"))) {
    console.error("Error: next.config.js not found. Please make sure you are running this command inside a Next.js app.");
    process.exit(1);
  }

  process.env.NEXT_PRIVATE_STANDALONE = 'true';
  
  // Build app
  const ret = await nextBuild({
    files: [],
    workPath: appPath,
    entrypoint: "next.config.js",
    config: {},
    meta: {},
  });

  // Prepare output directory
  fs.rmSync(outputDir, { recursive: true, force: true });

  // Create server Lambda function bundle
  createServerBundle();
  createMiddlewareBundle(ret.output.middleware.files["index.js"].data);
  createAssets();
}

function createServerBundle() {
  console.debug(`Bundling server function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-function");
  fs.mkdirSync(outputPath, { recursive: true });
  fs.cpSync(
    path.join(appPath, ".next/standalone"),
    path.join(outputPath),
    { recursive: true }
  );

  // Create the Lambda handler inside the .next/standalone directory
  // Note: .next/standalone already has a Node server "server.js",
  // replace it with Lambda handler
  fs.rmSync(
    path.join(outputPath, "server.js"),
    { force: true }
  );
  const result = buildSync({
    entryPoints: [
      path.resolve(__dirname, "../assets/server-adapter.cjs")
    ],
    bundle: true,
    target: "node16",
    platform: "node",
    external: ["next", "aws-sdk"],
    outfile: path.join(outputPath, "index.cjs"),
    format: "cjs",
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(`There was a problem bundling the server handler.`);
  }
}

function createMiddlewareBundle(src: string) {
  console.debug(`Bundling middleware edge function...`);

  // Create output folder
  const outputPath = path.join(outputDir, "middleware-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Create the middleware code
  const buildTempPath = path.resolve(__dirname, "../.middleware-build");
  fs.mkdirSync(buildTempPath, { recursive: true });
  fs.writeFileSync(path.join(buildTempPath, "middleware.js"), src);
  fs.copyFileSync(
    path.join(__dirname, "../assets/middleware-adapter.js"),
    path.join(buildTempPath, "middleware-adapter.js")
  );

  // Create a directory that we will use to create the bundled version
  // of the "core server build" along with our custom Lamba server handler.
  const result = buildSync({
    entryPoints: [path.join(buildTempPath, "middleware-adapter.js")],
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