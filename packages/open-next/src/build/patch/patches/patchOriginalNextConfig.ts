import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { inlineRequireResolvePlugin } from "../../../plugins/inline-require-resolve.js";
import * as buildHelper from "../../helper.js";

/**
 * Next 16.1+ removes `skipTrailingSlashRedirect` from the config in `required-server-files.json`.
 *
 * This patch adds it back in by compiling and importing the user's `next.config.js` file.
 *
 * It is a regression in https://github.com/vercel/next.js/pull/86830
 * TODO(#1082): revisit when Next is fixed
 */
export async function patchOriginalNextConfig(
  options: buildHelper.BuildOptions,
): Promise<void> {
  if (buildHelper.compareSemver(options.nextVersion, "<", "16.1.0")) {
    return;
  }

  // The manifests in both `.next` and `.next/standalone` folders
  // are patched as Open Next uses either of them.
  const manifestPath = path.join(
    options.appBuildOutputPath,
    ".next/required-server-files.json",
  );

  const manifestStandalonePath = path.join(
    options.appBuildOutputPath,
    ".next/standalone",
    buildHelper.getPackagePath(options),
    ".next/required-server-files.json",
  );

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(
      await fs.promises.readFile(manifestPath, "utf-8"),
    );
    if (manifest.config.skipTrailingSlashRedirect === undefined) {
      const { skipTrailingSlashRedirect, serverExternalPackages } =
        await importNextConfigFromSource(options);
      manifest.config.skipTrailingSlashRedirect =
        skipTrailingSlashRedirect ?? false;
      manifest.config.serverExternalPackages = serverExternalPackages ?? [];
      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify(manifest, null, 2),
        "utf-8",
      );
      if (fs.existsSync(manifestStandalonePath)) {
        await fs.promises.writeFile(
          manifestStandalonePath,
          JSON.stringify(manifest, null, 2),
          "utf-8",
        );
      }
    }
  } else {
    throw new Error(
      `Could not find required-server-files.json at path: ${manifestPath}`,
    );
  }
}

/**
 * Compile and import the user's `next.config` file
 *
 * @returns
 */
async function importNextConfigFromSource(
  buildOptions: buildHelper.BuildOptions,
) {
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
