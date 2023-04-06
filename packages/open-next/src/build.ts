import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import cp from "node:child_process";
import { buildSync, BuildOptions } from "esbuild";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const appPath = process.cwd();
const outputDir = ".open-next";
const tempDir = path.join(outputDir, ".build");

export async function build() {
  // Pre-build validation
  printVersion();
  checkRunningInsideNextjsApp();
  setStandaloneBuildMode();
  const { root: monorepoRoot, packager } = findMonorepoRoot();

  // Build Next.js app
  printHeader("Building Next.js app");
  await buildNextjsApp(packager);

  // Generate deployable bundle
  printHeader("Generating bundle");
  initOutputDir();
  createServerBundle(monorepoRoot);
  createImageOptimizationBundle();
  createAssets();
}

function checkRunningInsideNextjsApp() {
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

function setStandaloneBuildMode() {
  // Equivalent to setting `target: 'standalone'` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = "true";
}

function buildNextjsApp(packager: "npm" | "yarn" | "pnpm") {
  const result = cp.spawnSync(
    packager,
    packager === "npm" ? ["run", "build"] : ["build"],
    {
      stdio: "inherit",
      cwd: appPath,
      shell: true,
    }
  );
  if (result.status && result.status !== 0) {
    process.exit(1);
  }
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

function printVersion() {
  const pathToPackageJson = path.join(__dirname, "./package.json");
  const pkg = JSON.parse(fs.readFileSync(pathToPackageJson, "utf-8"));
  console.info(`Using v${pkg.version}`);
}

function initOutputDir() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function createServerBundle(monorepoRoot: string) {
  console.info(`Bundling server function...`);

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
    fs.writeFileSync(
      path.join(outputPath, "index.mjs"),
      [`export * from "./${packagePath}/index.mjs";`].join("")
    );
  }
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
    entryPoints: [
      path.join(__dirname, "adapters", "image-optimization-adapter.js"),
    ],
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
    path.join(__dirname, "./assets/sharp-node-modules"),
    path.join(outputPath, "node_modules"),
    { recursive: true }
  );
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
  fs.cpSync(path.join(appPath, "public"), outputPath, { recursive: true });
}

function esbuildSync(options: BuildOptions) {
  const result = buildSync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    minify: process.env.OPEN_NEXT_DEBUG ? false : true,
    sourcemap: process.env.OPEN_NEXT_DEBUG ? "inline" : false,
    ...options,
    // "process.env.OPEN_NEXT_DEBUG" determins if the logger writes to console.log
    define: {
      ...options.define,
      "process.env.OPEN_NEXT_DEBUG": process.env.OPEN_NEXT_DEBUG
        ? "true"
        : "false",
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(
      `There was a problem bundling ${(options.entryPoints as string[])[0]}.`
    );
  }
}
