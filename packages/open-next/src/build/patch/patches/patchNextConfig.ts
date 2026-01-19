import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { inlineRequireResolvePlugin } from "../../../plugins/inline-require-resolve.js";
import type { BuildOptions } from "../../helper.js";
import type { CodePatcher } from "../codePatcher.js";

/**
 * Next 16.1+ removes `skipTrailingSlashRedirect` from the config in `required-server-files.json`.
 * This patch adds it back in by compiling and importing the user's `next.config.js` file.
 */
export const patchNextConfig: CodePatcher = {
  name: "patch-next-config",
  patches: [
    {
      pathFilter: /required\-server\-files\.json$/,
      versions: ">=16.1.0",
      patchCode: async ({ code, buildOptions }) => {
        const manifest = JSON.parse(code);
        if (manifest.config.skipTrailingSlashRedirect === undefined) {
          const { skipTrailingSlashRedirect } =
            await importNextConfigFromSource(buildOptions);

          manifest.config.skipTrailingSlashRedirect =
            skipTrailingSlashRedirect ?? false;
        }
        return JSON.stringify(manifest, null, 2);
      },
    },
  ],
};

/**
 * Compile and import the user's `next.config` file
 *
 * @returns
 */
async function importNextConfigFromSource(buildOptions: BuildOptions) {
  // Find the `next.config file with any supported extension
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
      plugins: [inlineRequireResolvePlugin],
    });
    configToImport = path.join(buildOptions.tempBuildDir, "next.config.mjs");
  } else {
    // For .js, .mjs, .cjs, use the file directly
    configToImport = configPath;
  }

  return (await import(configToImport)).default;
}
