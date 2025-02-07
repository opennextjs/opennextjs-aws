import fs from "node:fs";
import path from "node:path";

import type {
  IncludedOriginResolver,
  LazyLoadedOverride,
  OverrideOptions,
} from "types/open-next.js";
import type { OriginResolver } from "types/overrides.js";
import { getCrossPlatformPathRegex } from "utils/regex.js";
import { openNextExternalMiddlewarePlugin } from "../../plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "../../plugins/replacement.js";
import { openNextResolvePlugin } from "../../plugins/resolve.js";
import { copyTracedFiles } from "../copyTracedFiles.js";
import * as buildHelper from "../helper.js";
import { installDependencies } from "../installDeps.js";

type Override = OverrideOptions & {
  originResolver?: LazyLoadedOverride<OriginResolver> | IncludedOriginResolver;
};

export async function buildExternalNodeMiddleware(
  options: buildHelper.BuildOptions,
) {
  const { appBuildOutputPath, config, outputDir } = options;
  if (!config.middleware?.external) {
    throw new Error(
      "This function should only be called for external middleware",
    );
  }
  const outputPath = path.join(outputDir, "middleware");
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs
  buildHelper.copyOpenNextConfig(
    options.buildDir,
    outputPath,
    await buildHelper.isEdgeRuntime(config.middleware.override),
  );
  const overrides = {
    ...config.middleware.override,
    originResolver: config.middleware.originResolver,
  };
  const includeCache = config.dangerous?.enableCacheInterception;
  const packagePath = buildHelper.getPackagePath(options);

  // TODO: change this so that we don't copy unnecessary files
  await copyTracedFiles(
    appBuildOutputPath,
    packagePath,
    outputPath,
    [],
    false,
    true,
  );

  function override<T extends keyof Override>(target: T) {
    return typeof overrides?.[target] === "string"
      ? overrides[target]
      : undefined;
  }

  // Bundle middleware
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "middleware.js"),
      ],
      outfile: path.join(outputPath, "handler.mjs"),
      external: ["./.next/*"],
      platform: "node",
      plugins: [
        openNextResolvePlugin({
          overrides: {
            wrapper: override("wrapper") ?? "aws-lambda",
            converter: override("converter") ?? "aws-cloudfront",
            ...(includeCache
              ? {
                  tagCache: override("tagCache") ?? "dynamodb-lite",
                  incrementalCache: override("incrementalCache") ?? "s3-lite",
                  queue: override("queue") ?? "sqs-lite",
                }
              : {}),
            originResolver: override("originResolver") ?? "pattern-env",
            proxyExternalRequest: override("proxyExternalRequest") ?? "node",
          },
          fnName: "middleware",
        }),
        openNextReplacementPlugin({
          name: "externalMiddlewareOverrides",
          target: getCrossPlatformPathRegex("adapters/middleware.js"),
          deletes: includeCache ? [] : ["includeCacheInMiddleware"],
        }),
        openNextExternalMiddlewarePlugin(
          path.join(
            options.openNextDistDir,
            "core",
            "nodeMiddlewareHandler.js",
          ),
        ),
      ],
      banner: {
        js: [
          `globalThis.monorepoPackagePath = "${packagePath}";`,
          "import process from 'node:process';",
          "import { Buffer } from 'node:buffer';",
          "import {AsyncLocalStorage} from 'node:async_hooks';",
          "import { createRequire as topLevelCreateRequire } from 'module';",
          "const require = topLevelCreateRequire(import.meta.url);",
          "import bannerUrl from 'url';",
          "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
        ].join(""),
      },
    },
    options,
  );

  // Do we need to copy or do something with env file here?

  installDependencies(outputPath, config.middleware?.install);
}

export async function buildBundledNodeMiddleware(
  options: buildHelper.BuildOptions,
) {
  await buildHelper.esbuildAsync(
    {
      entryPoints: [
        path.join(options.openNextDistDir, "core", "nodeMiddlewareHandler.js"),
      ],
      external: ["./.next/*"],
      outfile: path.join(options.buildDir, "middleware.mjs"),
      bundle: true,
      platform: "node",
    },
    options,
  );
}
