import fs from "fs";
import path from "path";
import url from "url";

import { BuildOptions, DangerousOptions } from "../adapters/types/open-next";
import openNextPlugin from "../plugin.js";
import { copyTracedFiles } from "./copyTracedFiles.js";
import {
  BuildRuntimeOptions,
  compareSemver,
  esbuildAsync,
  esbuildSync,
  traverseFiles,
} from "./utils.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export async function createServerBundle(
  options: BuildOptions,
  buildRuntimeOptions: BuildRuntimeOptions,
) {
  const foundRoutes = new Set<string>();
  // Get all functions to build
  const defaultFn = options.functions.default;
  const functions = Object.entries(options.functions).filter(
    ([name]) => name !== "default",
  ) as [string, BuildOptions["functions"][string]][];

  // Shared between functions
  const openNextConfigTmpPath = compileOpenNextConfig(buildRuntimeOptions);

  // We compile our own version of NextServer since the bundled one
  // only works in minimalMode.
  // It's hardcoded and minified so not easy to override either.
  const nextServerTmpPath = await compileNextServer(buildRuntimeOptions);

  //Should we allow people to have different cache for different functions?
  const cacheTmpPath = compileCache(buildRuntimeOptions, options.dangerous);

  const promises = functions.map(async ([name, fnOptions]) => {
    const routes = fnOptions.routes ?? ["app/page.tsx"];
    routes.forEach((route) => foundRoutes.add(route));
    await generateBundle(name, buildRuntimeOptions, fnOptions, {
      openNextConfig: openNextConfigTmpPath,
      cache: cacheTmpPath,
      nextServer: nextServerTmpPath,
    });
  });

  // We build every other function than default before so we know which route there is left
  await Promise.all(promises);

  const remainingRoutes = new Set<string>();

  // Find remaining routes
  const serverPath = path.join(
    buildRuntimeOptions.appBuildOutputPath,
    ".next",
    "standalone",
    ".next",
    "server",
  );

  // Find app dir routes
  const appPath = path.join(serverPath, "app");
  traverseFiles(
    appPath,
    (file) => {
      if (file.endsWith("page.js") || file.endsWith("route.js")) {
        const route = `app/${file.replace(/\.js$/, "")}`;
        // console.log(`Found remaining route: ${route}`);
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      }
      return false;
    },
    () => {},
  );

  // Find pages dir routes
  const pagePath = path.join(serverPath, "pages");
  traverseFiles(
    pagePath,
    (file) => {
      if (file.endsWith(".js")) {
        const route = `pages/${file.replace(/\.js$/, "")}`;
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      }
      return false;
    },
    () => {},
  );

  // Generate default function
  await generateBundle(
    "default",
    buildRuntimeOptions,
    {
      ...defaultFn,
      routes: Array.from(remainingRoutes),
    },
    {
      openNextConfig: openNextConfigTmpPath,
      cache: cacheTmpPath,
      nextServer: nextServerTmpPath,
    },
  );
}

function compileOpenNextConfig(options: BuildRuntimeOptions) {
  // Compile open-next.config.js
  const openNextConfigPath = path.join(options.appPath, "open-next.config.ts");
  const outputFile = path.join(
    options.outputDir,
    ".build",
    "open-next.config.mjs",
  );
  esbuildSync(
    {
      entryPoints: [openNextConfigPath],
      bundle: true,
      platform: "node",
      target: ["node18"],
      minify: true,
      outfile: outputFile,
    },
    options,
  );
  return outputFile;
}

function compileCache(
  options: BuildRuntimeOptions,
  dangerousOptions?: DangerousOptions,
) {
  const outfile = path.join(options.outputDir, ".build", "cache.cjs");
  esbuildSync(
    {
      external: ["next", "styled-jsx", "react", "@aws-sdk/*"],
      entryPoints: [path.join(__dirname, "../adapters", "cache.js")],
      outfile,
      target: ["node18"],
      format: "cjs",
      banner: {
        js: [
          `globalThis.disableIncrementalCache = ${
            dangerousOptions?.disableIncrementalCache ?? false
          };`,
          `globalThis.disableDynamoDBCache = ${
            dangerousOptions?.disableDynamoDBCache ?? false
          };`,
        ].join(""),
      },
    },
    options,
  );
  return outfile;
}

// This one could be tricky to get right.
// https://github.com/vercel/next.js/blob/canary/packages/next/webpack.config.js
// They use webpack to compile the minimal server runtime.
async function compileNextServer(options: BuildRuntimeOptions) {
  const externals = [
    // This one was causing trouble, don't know why
    "../experimental/testmode/server",

    // sharedExternals
    "styled-jsx",
    "styled-jsx/style",
    "@opentelemetry/api",
    "next/dist/compiled/@next/react-dev-overlay/dist/middleware",
    "next/dist/compiled/@ampproject/toolbox-optimizer",
    "next/dist/compiled/edge-runtime",
    "next/dist/compiled/@edge-runtime/ponyfill",
    "next/dist/compiled/undici",
    "next/dist/compiled/raw-body",
    "next/dist/server/capsize-font-metrics.json",
    "critters",
    "next/dist/compiled/node-html-parser",
    "next/dist/compiled/compression",
    "next/dist/compiled/jsonwebtoken",
    "next/dist/compiled/@opentelemetry/api",
    "next/dist/compiled/@mswjs/interceptors/ClientRequest",
    "next/dist/compiled/ws",

    // externalsMap
    // In the config they replace it, but we don't use this one inside NextServer anymore 13.4.12+
    // For earlier versions we might have to alias it
    "./web/sandbox",

    // pagesExternal
    "react",
    "react-dom",
    "react-server-dom-webpack",
    "react-server-dom-turbopack",

    // We need to remove this since this is what webpack is building
    // Adding it cause to add a lot of unnecessary deps
    "next/dist/compiled/next-server",
  ];
  const outfile = path.join(
    options.outputDir,
    ".build",
    "next-server.runtime.prod.js",
  );
  await esbuildAsync(
    {
      entryPoints: ["node_modules/next/dist/esm/server/next-server.js"],
      bundle: true,
      platform: "node",
      target: ["node18"],
      // packages: "external",
      format: "cjs",
      external: externals,
      minify: true,
      outfile,
      sourcemap: false,
      plugins: [
        {
          name: "opennext-next-server",
          setup(build) {
            // This was an attempt at reducing server bundle size
            // It might be the better way to go in the future
            build.onResolve(
              { filter: /future\/route-modules\/(app|pages)\/module.compiled/ },
              (args) => {
                return {
                  path: args.path,
                  external: true,
                };
              },
            );
          },
        },
      ],
    },
    options,
  );
  return outfile;
}

function getPlugins(options: BuildRuntimeOptions) {
  let plugins =
    compareSemver(options.nextVersion, "13.4.13") >= 0
      ? [
          openNextPlugin({
            name: "opennext-13.4.13-serverHandler",
            target: /plugins\/serverHandler\.js/g,
            replacements: ["./serverHandler.replacement.js"],
          }),
          openNextPlugin({
            name: "opennext-13.4.13-util",
            target: /plugins\/util\.js/g,
            replacements: ["./util.replacement.js"],
          }),
          openNextPlugin({
            name: "opennext-13.4.13-default",
            target: /plugins\/routing\/default\.js/g,
            replacements: ["./default.replacement.js"],
          }),
        ]
      : undefined;

  if (compareSemver(options.nextVersion, "13.5.1") >= 0) {
    plugins = [
      openNextPlugin({
        name: "opennext-13.5-serverHandler",
        target: /plugins\/serverHandler\.js/g,
        replacements: ["./13.5/serverHandler.js"],
      }),
      openNextPlugin({
        name: "opennext-13.5-util",
        target: /plugins\/util\.js/g,
        replacements: ["./13.5/util.js", "./util.replacement.js"],
      }),
      openNextPlugin({
        name: "opennext-13.5-default",
        target: /plugins\/routing\/default\.js/g,
        replacements: ["./default.replacement.js"],
      }),
    ];
  }

  return plugins;
}

async function generateBundle(
  name: string,
  options: BuildRuntimeOptions,
  fnOptions: BuildOptions["functions"][string],
  precompiledPaths: {
    nextServer: string;
    openNextConfig: string;
    cache: string;
  },
) {
  const { appPath, appBuildOutputPath, outputDir, monorepoRoot } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "server-functions", name);
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy cache file
  fs.copyFileSync(precompiledPaths.cache, path.join(outputPath, "cache.cjs"));

  // Copy next-server
  fs.copyFileSync(
    precompiledPaths.nextServer,
    path.join(outputPath, "next-server.runtime.prod.js"),
  );

  // Copy open-next.config.js
  // We should reuse the one we created at the beginning of the build
  fs.copyFileSync(
    precompiledPaths.openNextConfig,
    path.join(outputPath, "open-next.config.mjs"),
  );

  // Resolve path to the Next.js app if inside the monorepo
  // note: if user's app is inside a monorepo, standalone mode places
  //       `node_modules` inside `.next/standalone`, and others inside
  //       `.next/standalone/package/path` (ie. `.next`, `server.js`).
  //       We need to output the handler file inside the package path.
  const isMonorepo = monorepoRoot !== appPath;
  const packagePath = path.relative(monorepoRoot, appBuildOutputPath);

  // Copy all necessary traced files
  copyTracedFiles(
    appBuildOutputPath,
    outputPath,
    fnOptions.routes ?? ["app/page.tsx"],
  );

  const plugins = getPlugins(options);

  if (plugins && plugins.length > 0) {
    console.log(
      `${name} -- Applying plugins:: [${plugins
        .map(({ name }) => name)
        .join(",")}] for Next version: ${options.nextVersion}`,
    );
  }

  await esbuildAsync(
    {
      entryPoints: [path.join(__dirname, "../adapters", "server-adapter.js")],
      external: [
        "next",
        "./next-server.runtime.prod.js",
        "./open-next.config.mjs",
        "@aws-sdk/*",
      ],
      outfile: path.join(outputPath, packagePath, "index.mjs"),
      banner: {
        js: [
          `globalThis.monorepoPackagePath = "${packagePath}";`,
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join(""),
      },
      plugins,
    },
    options,
  );
}
