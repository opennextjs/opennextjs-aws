import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { execSync } from "node:child_process";
import type { InstallOptions } from "types/open-next";

import logger from "../logger.js";

const AFFECTED_NODE_VERSIONS = ["22.17.0", "22.17.1", "22.18.0"];

export function installDependencies(
  outputDir: string,
  installOptions?: InstallOptions,
) {
  try {
    if (!installOptions) {
      return;
    }
    const name = outputDir.split("/").pop();
    // First we create a tempDir
    const tempInstallDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `open-next-install-${name}`),
    );
    logger.info(`Installing dependencies for ${name}...`);
    // We then need to run install in the tempDir
    // We don't install in the output dir directly because it could contain a package.json, and npm would then try to reinstall not complete deps from tracing the files
    const archOption = installOptions.arch
      ? `--arch=${installOptions.arch}`
      : "";
    const targetOption = installOptions.nodeVersion
      ? `--target=${installOptions.nodeVersion}`
      : "";
    const libcOption = installOptions.libc
      ? `--libc=${installOptions.libc}`
      : "";
    const osOption = `--os=${installOptions.os ?? "linux"}`;

    const additionalArgs = installOptions.additionalArgs ?? "";
    const installCommand = `npm install ${osOption} ${archOption} ${targetOption} ${libcOption} ${additionalArgs} ${installOptions.packages.join(" ")}`;
    execSync(installCommand, {
      stdio: "pipe",
      cwd: tempInstallDir,
      env: {
        ...process.env,
        SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
      },
    });

    // Copy the node_modules to the outputDir
    fs.cpSync(
      path.join(tempInstallDir, "node_modules"),
      path.join(outputDir, "node_modules"),
      { recursive: true, force: true, dereference: true },
    );

    // This is a workaround for Node `22.17.0` and `22.17.1`
    // https://github.com/nodejs/node/issues/59168
    const nodeVersion = process.versions.node;
    if (AFFECTED_NODE_VERSIONS.includes(nodeVersion)) {
      const tempBinDir = path.join(tempInstallDir, "node_modules", ".bin");
      const outputBinDir = path.join(outputDir, "node_modules", ".bin");

      for (const fileName of fs.readdirSync(tempBinDir)) {
        const symlinkPath = path.join(tempBinDir, fileName);
        const stat = fs.lstatSync(symlinkPath);

        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(symlinkPath);
          const realFilePath = path.resolve(tempBinDir, linkTarget);

          const outputFilePath = path.join(outputBinDir, fileName);

          if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
          }

          fs.copyFileSync(realFilePath, outputFilePath);
          fs.chmodSync(outputFilePath, "755");
          logger.debug(`Replaced symlink ${fileName} with actual file`);
        }
      }
    }

    // Cleanup tempDir
    fs.rmSync(tempInstallDir, { recursive: true, force: true });
    logger.info(`Dependencies installed for ${name}`);
  } catch (e: any) {
    logger.error(e.toString());
    logger.error("Could not install dependencies");
  }
}
