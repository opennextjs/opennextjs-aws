import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import type { CodePatcher } from "../codePatcher";

export const patchNextConfig: CodePatcher = {
  name: "patch-next-config",
  patches: [
    {
      pathFilter: /required\-server\-files\.json$/,
      versions: ">=16.1.0",
      patchCode: async ({ code, buildOptions }) => {
        // Find the next.config file with any supported extension
        const tsExtensions = [".ts", ".mts", ".cts"];
        const possibleExtensions = [...tsExtensions, ".mjs", ".js", ".cjs"];
        let configPath: string | undefined;
        let configExtension: string | undefined;

        for (const ext of possibleExtensions) {
          const testPath = path.join(buildOptions.appPath, `next.config${ext}`);
          if (fs.existsSync(testPath)) {
            configPath = testPath;
            configExtension = ext;
            break;
          }
        }

        if (!configPath || !configExtension) {
          throw new Error("Could not find next.config file");
        }

        let configToImport: string;

        // Only compile if the extension is a TypeScript extension
        if (tsExtensions.includes(configExtension)) {
          await build({
            entryPoints: [configPath],
            outfile: path.join(buildOptions.tempBuildDir, "next.config.mjs"),
            bundle: true,
            format: "esm",
            platform: "node",
            plugins: [
              {
                name: "inline-require-resolve",
                setup: (build) => {
                  build.onLoad(
                    { filter: /\.(js|ts|mjs|cjs)$/ },
                    async (args) => {
                      const transformed = fs
                        .readFileSync(args.path, "utf-8")
                        .replace(
                          /require\.resolve\(['"]([^'"]+)['"]\)/g,
                          (_, modulePath) => {
                            try {
                              return JSON.stringify(
                                createRequire(args.path).resolve(modulePath),
                              );
                            } catch {
                              return `require.resolve('${modulePath}')`;
                            }
                          },
                        );

                      return { contents: transformed, loader: "default" };
                    },
                  );
                },
              },
            ],
          });
          configToImport = path.join(
            buildOptions.tempBuildDir,
            "next.config.mjs",
          );
        } else {
          // For .js, .mjs, .cjs, use the file directly
          configToImport = configPath;
        }

        // In next 16.1+ we need to add `skipTrailingSlashRedirect` manually because next removes it from the config
        const originalConfig = (await import(configToImport)).default;
        const config = JSON.parse(code);
        if (config.config.skipTrailingSlashRedirect === undefined) {
          config.config.skipTrailingSlashRedirect =
            originalConfig.skipTrailingSlashRedirect ?? false;
        }
        return JSON.stringify(config, null, 2);
      },
    },
  ],
};
