import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import logger from "../logger.js";
import { openNextReplacementPlugin } from "../plugins/replacement.js";
import { openNextResolvePlugin } from "../plugins/resolve.js";
import { getCrossPlatformPathRegex } from "../utils/regex.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";

const require = createRequire(import.meta.url);

export async function createImageOptimizationBundle(
  options: buildHelper.BuildOptions,
) {
  logger.info("Bundling image optimization function...");

  const { appBuildOutputPath, config, outputDir } = options;

  // Create output folder
  const outputPath = path.join(outputDir, "image-optimization-function");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs into the bundle
  buildHelper.copyOpenNextConfig(options.buildDir, outputPath);

  const plugins = [
    openNextResolvePlugin({
      fnName: "imageOptimization",
      overrides: {
        converter: config.imageOptimization?.override?.converter,
        wrapper: config.imageOptimization?.override?.wrapper,
        imageLoader: config.imageOptimization?.loader,
      },
    }),
  ];

  if (buildHelper.compareSemver(options.nextVersion, ">=", "14.1.1")) {
    plugins.push(
      openNextReplacementPlugin({
        name: "opennext-14.1.1-image-optimization",
        target: getCrossPlatformPathRegex(
          "plugins/image-optimization/image-optimization.js",
        ),
        replacements: [
          require.resolve(
            "../adapters/plugins/image-optimization/image-optimization.replacement.js",
          ),
        ],
      }),
    );
  }

  // Build Lambda code (1st pass)
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "@aws-sdk/client-s3" package which is not a dependency in user's
  //       Next.js app.
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(
          options.openNextDistDir,
          "adapters",
          "image-optimization-adapter.js",
        ),
      ],
      external: [
        "sharp",
        "next",
        ...(config.imageOptimization?.esbuild?.external ?? []),
      ],
      outfile: path.join(outputPath, "index.mjs"),
      plugins,
    },
    options,
  );

  // Build Lambda code (2nd pass)
  // note: bundle in user's Next.js app again b/c the adapter relies on the
  //       "next" package. And the "next" package from user's app should
  //       be used. We also set @opentelemetry/api as external because it seems to be
  //       required by Next 15 even though it's not used.
  buildHelper.esbuildSync(
    {
      entryPoints: [path.join(outputPath, "index.mjs")],
      external: [
        "sharp",
        "@opentelemetry/api",
        ...(config.imageOptimization?.esbuild?.external ?? []),
      ],
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
    },
    options,
  );

  // Copy over .next/required-server-files.json file and BUILD_ID
  fs.mkdirSync(path.join(outputPath, ".next"));
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next/required-server-files.json"),
    path.join(outputPath, ".next/required-server-files.json"),
  );
  fs.copyFileSync(
    path.join(appBuildOutputPath, ".next/BUILD_ID"),
    path.join(outputPath, ".next/BUILD_ID"),
  );

  // Sharp provides pre-build binaries for all platforms. https://github.com/lovell/sharp/blob/main/docs/install.md#cross-platform
  // Target should be same as used by Lambda, see https://github.com/sst/sst/blob/ca6f763fdfddd099ce2260202d0ce48c72e211ea/packages/sst/src/constructs/NextjsSite.ts#L114
  // For SHARP_IGNORE_GLOBAL_LIBVIPS see: https://github.com/lovell/sharp/blob/main/docs/install.md#aws-lambda

  const sharpVersion = process.env.SHARP_VERSION ?? "0.32.6";

  // In development, we want to use the local machine settings
  const isDev = config.imageOptimization?.loader === "fs-dev";

  installDependencies(
    outputPath,
    config.imageOptimization?.install ?? {
      packages: [`sharp@${sharpVersion}`],
      // By not specifying an arch in dev, `npm install` will choose one for us (i.e. our system one)
      arch: isDev ? undefined : "arm64",
      // Use the local platform in dev
      os: isDev ? os.platform() : "linux",
      nodeVersion: "18",
      libc: "glibc",
    },
  );
}
