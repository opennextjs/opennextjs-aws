import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { inlineRequireResolvePlugin } from "../../../plugins/inline-require-resolve.js";
import * as buildHelper from "../../helper.js";

/**
 * Next 16.1.0-16.1.4 has missing fields in `required-server-files.json`:
 * - `skipTrailingSlashRedirect`
 * - `serverExternalPackages`
 *
 * This patch adds them back in by compiling and importing the user's `next.config.js` file.
 *
 * It is a regression in https://github.com/vercel/next.js/pull/86830 (16.1.0)
 * Fixed in https://github.com/vercel/next.js/pull/88733 (16.1.4)
 */
export async function patchOriginalNextConfig(
  options: buildHelper.BuildOptions,
): Promise<void> {
  if (
    buildHelper.compareSemver(options.nextVersion, "<", "16.1.0") ||
    buildHelper.compareSemver(options.nextVersion, ">=", "16.1.4")
  ) {
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
  const nextConfigDetails = buildHelper.findNextConfig(buildOptions);

  if (!nextConfigDetails) {
    throw new Error("Could not find next.config file");
  }

  const { path: configPath, isTypescript: configIsTs } = nextConfigDetails;

  let configToImport: string;

  // Only compile if the extension is a TypeScript extension
  if (configIsTs) {
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
