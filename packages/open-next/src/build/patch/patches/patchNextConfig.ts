import { buildSync } from "esbuild";
import { CodePatcher } from "../codePatcher";
import path from "node:path";

export const patchNextConfig : CodePatcher = {
    name: "patch-next-config",
    patches: [
        {
            "pathFilter": /required\-server\-files\.json$/,
            versions: ">=16.1.0",
            patchCode: async ({ code, buildOptions  }) => {
                console.log("Patching required-server-files.json to include skipTrailingSlashRedirect");

                // Because Next config could be in TS format, we need to first convert it to JS
                buildSync({
                    entryPoints: [path.join(buildOptions.appPath, 'next.config.ts')],
                    outfile: path.join(buildOptions.tempBuildDir, 'next.config.mjs'),
                    bundle: true,
                    format: 'esm',
                    platform: 'node',
                })
                // In next 16.1+ we need to add `skipTrailingSlashRedirect` manually because next removes it from the config
                const originalConfig = (await import(path.join(buildOptions.tempBuildDir, 'next.config.mjs'))).default;
                const config = JSON.parse(code);
                console.log("Original config:", originalConfig, config);
                if (config.config.skipTrailingSlashRedirect === undefined) {
                    config.config.skipTrailingSlashRedirect = originalConfig.skipTrailingSlashRedirect ?? false;
                }
                return JSON.stringify(config, null, 2);
            }
        }
    ],
};