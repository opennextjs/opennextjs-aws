import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { installDependencies } from "@opennextjs/aws/build/installDeps.js";
import logger from "@opennextjs/aws/logger.js";
import { vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...original,
    // installDependencies copies node_modules out of the install dir, so the mock has to create it
    execSync: vi.fn((_command: string, options: { cwd: string }) => {
      fs.mkdirSync(path.join(options.cwd, "node_modules", ".bin"), {
        recursive: true,
      });
      return Buffer.from("");
    }),
  };
});

describe("installDependencies", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(path.join(os.tmpdir(), "open-next-install-test-"));
    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  function getInstallCommand() {
    expect(execSync).toHaveBeenCalledTimes(1);
    return vi.mocked(execSync).mock.calls[0][0] as string;
  }

  it("should use --cpu instead of --arch and omit --target - npm 12 rejects (npm 11 warns) both", () => {
    installDependencies(outputDir, {
      packages: ["sharp@0.35.5"],
      arch: "arm64",
      os: "linux",
      libc: "glibc",
      nodeVersion: "18",
    });

    const command = getInstallCommand();
    expect(command).toContain("--os=linux");
    expect(command).toContain("--cpu=arm64");
    expect(command).toContain("--libc=glibc");
    expect(command).toContain("sharp@0.35.5");
    expect(command).not.toContain("--arch");
    expect(command).not.toContain("--target");
  });

  it("should warn that nodeVersion is deprecated", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    installDependencies(outputDir, {
      packages: ["sharp@0.35.5"],
      nodeVersion: "18",
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("install.nodeVersion is deprecated"),
    );
    warn.mockRestore();
  });

  it("should omit --cpu when arch is not set", () => {
    installDependencies(outputDir, {
      packages: ["sharp@0.35.5"],
    });

    const command = getInstallCommand();
    expect(command).toContain("--os=linux");
    expect(command).not.toContain("--cpu");
    expect(command).not.toContain("--arch");
    expect(command).not.toContain("--target");
  });

  it("should pass additionalArgs to the install command", () => {
    installDependencies(outputDir, {
      packages: ["sharp@0.35.5"],
      arch: "x64",
      additionalArgs: "--ignore-scripts",
    });

    const command = getInstallCommand();
    expect(command).toContain("--cpu=x64");
    expect(command).toContain("--ignore-scripts");
  });
});
