import fs from "node:fs";
import path from "node:path";

import type { FunctionOptions, SplittedFunctionOptions } from "types/open-next";

import logger from "../logger.js";
import { minifyAll } from "../minimize-js.js";
import { openNextReplacementPlugin } from "../plugins/replacement.js";
import { openNextResolvePlugin } from "../plugins/resolve.js";
import { getCrossPlatformPathRegex } from "../utils/regex.js";
import { bundleNextServer } from "./bundleNextServer.js";
import { compileCache } from "./compileCache.js";
import { copyTracedFiles } from "./copyTracedFiles.js";
import { generateEdgeBundle } from "./edge/createEdgeBundle.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";

export async function createServerBundle(options: buildHelper.BuildOptions) {
  const { config } = options;
  const foundRoutes = new Set<string>();
  // Get all functions to build
  const defaultFn = config.default;
  const functions = Object.entries(config.functions ?? {});

  // Recompile cache.ts as ESM if any function is using Deno runtime
  if (
    defaultFn.runtime === "deno" ||
    functions.some(([, fn]) => fn.runtime === "deno")
  ) {
    compileCache(options, "esm");
  }

  const promises = functions.map(async ([name, fnOptions]) => {
    const routes = fnOptions.routes;
    routes.forEach((route) => foundRoutes.add(route));
    if (fnOptions.runtime === "edge") {
      await generateEdgeBundle(name, options, fnOptions);
    } else {
      await generateBundle(name, options, fnOptions);
    }
  });

  //TODO: throw an error if not all edge runtime routes has been bundled in a separate function

  // We build every other function than default before so we know which route there is left
  await Promise.all(promises);

  const remainingRoutes = new Set<string>();

  const { appBuildOutputPath } = options;

  // Find remaining routes
  const serverPath = path.join(
    appBuildOutputPath,
    ".next/standalone",
    buildHelper.getPackagePath(options),
    ".next/server",
  );

  // Find app dir routes
  if (fs.existsSync(path.join(serverPath, "app"))) {
    const appPath = path.join(serverPath, "app");
    buildHelper.traverseFiles(
      appPath,
      ({ relativePath }) =>
        relativePath.endsWith("page.js") || relativePath.endsWith("route.js"),
      ({ relativePath }) => {
        const route = `app/${relativePath.replace(/\.js$/, "")}`;
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      },
    );
  }

  // Find pages dir routes
  if (fs.existsSync(path.join(serverPath, "pages"))) {
    const pagePath = path.join(serverPath, "pages");
    buildHelper.traverseFiles(
      pagePath,
      ({ relativePath }) => relativePath.endsWith(".js"),
      ({ relativePath }) => {
        const route = `pages/${relativePath.replace(/\.js$/, "")}`;
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      },
    );
  }

  // Generate default function
  await generateBundle("default", options, {
    ...defaultFn,
    // @ts-expect-error - Those string are RouteTemplate
    routes: Array.from(remainingRoutes),
    patterns: ["*"],
  });
}

async function generateBundle(
  name: string,
  options: buildHelper.BuildOptions,
  fnOptions: SplittedFunctionOptions,
) {
  const { appPath, appBuildOutputPath, config, outputDir, monorepoRoot } =
    options;
  logger.info(`Building server function: ${name}...`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-functions", name);

  // Resolve path to the Next.js app if inside the monorepo
  // note: if user's app is inside a monorepo, standalone mode places
  //       `node_modules` inside `.next/standalone`, and others inside
  //       `.next/standalone/package/path` (ie. `.next`, `server.js`).
  //       We need to output the handler file inside the package path.
  const packagePath = buildHelper.getPackagePath(options);
  fs.mkdirSync(path.join(outputPath, packagePath), { recursive: true });

  const ext = fnOptions.runtime === "deno" ? "mjs" : "cjs";
  fs.copyFileSync(
    path.join(options.buildDir, `cache.${ext}`),
    path.join(outputPath, packagePath, "cache.cjs"),
  );

  if (fnOptions.runtime === "deno") {
    addDenoJson(outputPath, packagePath);
  }

  // Bundle next server if necessary
  const isBundled = fnOptions.experimentalBundledNextServer ?? false;
  if (isBundled) {
    await bundleNextServer(path.join(outputPath, packagePath), appPath, {
      minify: options.minify,
    });
  }

  // Copy middleware
  if (!config.middleware?.external) {
    fs.copyFileSync(
      path.join(options.buildDir, "middleware.mjs"),
      path.join(outputPath, packagePath, "middleware.mjs"),
    );
  }

  // Copy open-next.config.mjs
  buildHelper.copyOpenNextConfig(
    options.buildDir,
    path.join(outputPath, packagePath),
  );

  // Copy env files
  buildHelper.copyEnvFile(appBuildOutputPath, packagePath, outputPath);

  // Copy all necessary traced files
  await copyTracedFiles(
    appBuildOutputPath,
    packagePath,
    outputPath,
    fnOptions.routes ?? ["app/page.tsx"],
    isBundled,
  );

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.

  const disableNextPrebundledReact =
    buildHelper.compareSemver(options.nextVersion, "13.5.1") >= 0 ||
    buildHelper.compareSemver(options.nextVersion, "13.4.1") <= 0;

  const overrides = fnOptions.override ?? {};

  const isBefore13413 =
    buildHelper.compareSemver(options.nextVersion, "13.4.13") <= 0;
  const isAfter141 =
    buildHelper.compareSemver(options.nextVersion, "14.1") >= 0;

  const disableRouting = isBefore13413 || config.middleware?.external;

  const plugins = [
    openNextReplacementPlugin({
      name: `requestHandlerOverride ${name}`,
      target: getCrossPlatformPathRegex("core/requestHandler.js"),
      deletes: [
        ...(disableNextPrebundledReact ? ["applyNextjsPrebundledReact"] : []),
        ...(disableRouting ? ["withRouting"] : []),
      ],
    }),
    openNextReplacementPlugin({
      name: `utilOverride ${name}`,
      target: getCrossPlatformPathRegex("core/util.js"),
      deletes: [
        ...(disableNextPrebundledReact ? ["requireHooks"] : []),
        ...(isBefore13413 ? ["trustHostHeader"] : ["requestHandlerHost"]),
        ...(isAfter141
          ? ["experimentalIncrementalCacheHandler"]
          : ["stableIncrementalCache"]),
      ],
    }),

    openNextResolvePlugin({
      fnName: name,
      overrides,
    }),
  ];

  const outfileExt = fnOptions.runtime === "deno" ? "ts" : "mjs";
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "server-adapter.js"),
      ],
      external: ["next", "./middleware.mjs", "./next-server.runtime.prod.js"],
      outfile: path.join(outputPath, packagePath, `index.${outfileExt}`),
      banner: {
        js: [
          `globalThis.monorepoPackagePath = "${packagePath}";`,
          "import process from 'node:process';",
          "import { Buffer } from 'node:buffer';",
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
          name === "default" ? "" : `globalThis.fnName = "${name}";`,
        ].join(""),
      },
      plugins,
      alias: {
        ...(isBundled
          ? {
              "next/dist/server/next-server.js":
                "./next-server.runtime.prod.js",
            }
          : {}),
      },
    },
    options,
  );

  const isMonorepo = monorepoRoot !== appPath;
  if (isMonorepo) {
    addMonorepoEntrypoint(outputPath, packagePath);
  }

  installDependencies(outputPath, fnOptions.install);

  if (fnOptions.minify) {
    await minifyServerBundle(outputPath);
  }

  const shouldGenerateDocker = shouldGenerateDockerfile(fnOptions);
  if (shouldGenerateDocker) {
    fs.writeFileSync(
      path.join(outputPath, "Dockerfile"),
      typeof shouldGenerateDocker === "string"
        ? shouldGenerateDocker
        : `
FROM node:18-alpine
WORKDIR /app
COPY . /app
EXPOSE 3000
CMD ["node", "index.mjs"]
    `,
    );
  }
}

function shouldGenerateDockerfile(options: FunctionOptions) {
  return options.override?.generateDockerfile ?? false;
}

// Add deno.json file to enable "bring your own node_modules" mode.
// TODO: this won't be necessary in Deno 2. See https://github.com/denoland/deno/issues/23151
function addDenoJson(outputPath: string, packagePath: string) {
  const config = {
    // Enable "bring your own node_modules" mode
    // and allow `__proto__`
    unstable: ["byonm", "fs", "unsafe-proto"],
  };
  fs.writeFileSync(
    path.join(outputPath, packagePath, "deno.json"),
    JSON.stringify(config, null, 2),
  );
}

//TODO: check if this PR is still necessary https://github.com/opennextjs/opennextjs-aws/pull/341
function addMonorepoEntrypoint(outputPath: string, packagePath: string) {
  // Note: in the monorepo case, the handler file is output to
  //       `.next/standalone/package/path/index.mjs`, but we want
  //       the Lambda function to be able to find the handler at
  //       the root of the bundle. We will create a dummy `index.mjs`
  //       that re-exports the real handler.

  // Always use posix path for import path
  const packagePosixPath = packagePath.split(path.sep).join(path.posix.sep);
  fs.writeFileSync(
    path.join(outputPath, "index.mjs"),
    `export * from "./${packagePosixPath}/index.mjs";`,
  );
}

async function minifyServerBundle(outputDir: string) {
  logger.info("Minimizing server function...");

  await minifyAll(outputDir, {
    compress_json: true,
    mangle: true,
  });
}
