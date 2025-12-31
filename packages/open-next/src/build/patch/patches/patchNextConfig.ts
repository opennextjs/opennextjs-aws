import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import type { CodePatcher } from "../codePatcher";

export const patchNextConfig: CodePatcher = {
  name: "patch-next-config",
  patches: [
    {
      pathFilter: /required\-server\-files\.json$/,
      versions: ">=16.1.0",
      patchCode: async ({ code, buildOptions }) => {
        // Find the next.config file with any supported extension
        const possibleExtensions = [".ts", ".mjs", ".js", ".cjs"];
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

        // Only compile if the extension is .ts
        if (configExtension === ".ts") {
          buildSync({
            entryPoints: [configPath],
            outfile: path.join(buildOptions.tempBuildDir, "next.config.mjs"),
            bundle: true,
            format: "esm",
            platform: "node",
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
