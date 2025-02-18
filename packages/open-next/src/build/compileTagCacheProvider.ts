import path from "node:path";

import { openNextResolvePlugin } from "../plugins/resolve.js";
import * as buildHelper from "./helper.js";
import { installDependencies } from "./installDeps.js";

export async function compileTagCacheProvider(
  options: buildHelper.BuildOptions,
) {
  const providerPath = path.join(options.outputDir, "dynamodb-provider");

  const overrides = options.config.initializationFunction?.override;

  await buildHelper.esbuildAsync(
    {
      external: ["@aws-sdk/client-dynamodb"],
      entryPoints: [
        path.join(options.openNextDistDir, "adapters", "dynamo-provider.js"),
      ],
      outfile: path.join(providerPath, "index.mjs"),
      target: ["node18"],
      plugins: [
        openNextResolvePlugin({
          fnName: "initializationFunction",
          overrides: {
            converter: overrides?.converter ?? "dummy",
            wrapper: overrides?.wrapper,
            tagCache: options.config.initializationFunction?.tagCache,
          },
        }),
      ],
    },
    options,
  );

  installDependencies(
    providerPath,
    options.config.initializationFunction?.install,
  );
}
