import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  copyTracedFiles,
  isExcluded,
  isNonLinuxPlatformPackage,
} from "@opennextjs/aws/build/copyTracedFiles.js";
import { vi } from "vitest";

// Note: the patch file is only emitted by the build, it does not exist when running from the sources
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    copyFileSync: (...args: Parameters<typeof fs.copyFileSync>) => {
      if (String(args[0]).endsWith("patchedAsyncStorage.js")) {
        fs.writeFileSync(args[1], "");
      } else {
        fs.copyFileSync(...args);
      }
    },
  };
});

describe("copyTracedFiles", () => {
  let buildOutputPath: string;
  let outputDir: string;
  let standaloneNextDir: string;

  beforeEach(() => {
    buildOutputPath = mkdtempSync(path.join(os.tmpdir(), "open-next-build-"));
    outputDir = path.join(buildOutputPath, ".open-next");
    standaloneNextDir = path.join(buildOutputPath, ".next/standalone/.next");
    mkdirSync(path.join(standaloneNextDir, "server"), { recursive: true });
    writeFileSync(path.join(standaloneNextDir, "BUILD_ID"), "build-id");
    writeFileSync(
      path.join(standaloneNextDir, "required-server-files.json"),
      JSON.stringify({ config: { experimental: { optimizeCss: true } } }),
    );
    writeFileSync(
      path.join(standaloneNextDir, "server/pages-manifest.json"),
      "{}",
    );
    writeFileSync(
      path.join(standaloneNextDir, "server/middleware-manifest.json"),
      "{}",
    );
  });

  afterEach(() => {
    rmSync(buildOutputPath, { recursive: true, force: true });
  });

  function copy() {
    return copyTracedFiles({
      buildOutputPath,
      packagePath: "",
      outputDir,
      routes: [],
      bundledNextServer: false,
      skipServerFiles: true,
    });
  }

  it("should copy static/css when optimizeCss is enabled", async () => {
    const cssDir = path.join(standaloneNextDir, "static/css");
    mkdirSync(cssDir, { recursive: true });
    writeFileSync(path.join(cssDir, "app.css"), "body{}");

    await copy();

    expect(
      readFileSync(path.join(outputDir, ".next/static/css/app.css"), "utf8"),
    ).toBe("body{}");
  });

  it("should not throw when optimizeCss is enabled and static/css does not exist", async () => {
    await expect(copy()).resolves.toBeDefined();

    expect(existsSync(path.join(outputDir, ".next/static/css"))).toBe(false);
  });
});

describe("isExcluded", () => {
  test("should exclude sharp", () => {
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/sharp/lib/index.js",
      ),
    ).toBe(true);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/sharp/4.1.3/node_modules/sharp/lib/index.js",
      ),
    ).toBe(true);
    expect(
      isExcluded("/home/user/git/my-opennext-project/node_modules/sharp"),
    ).toBe(true);
  });

  test("should not exclude other packages", () => {
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/sharp-other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/sharp-other",
      ),
    ).toBe(false);
  });
});

describe("isNonLinuxPlatformPackage", () => {
  test("should exclude darwin packages", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node",
      ),
    ).toBe(true);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@esbuild/darwin-x64/bin/esbuild",
      ),
    ).toBe(true);
  });

  test("should exclude win32 packages", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@swc/core-win32-x64-msvc/swc.win32-x64-msvc.node",
      ),
    ).toBe(true);
  });

  test("should exclude freebsd packages", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@rollup/rollup-freebsd-x64/rollup.freebsd-x64.node",
      ),
    ).toBe(true);
  });

  test("should keep linux packages", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@swc/core-linux-x64-gnu/swc.linux-x64-gnu.node",
      ),
    ).toBe(false);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@swc/core-linux-arm64-gnu/swc.linux-arm64-gnu.node",
      ),
    ).toBe(false);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/@esbuild/linux-x64/bin/esbuild",
      ),
    ).toBe(false);
  });

  test("should keep non-platform packages", () => {
    expect(
      isNonLinuxPlatformPackage("/project/node_modules/@swc/core/index.js"),
    ).toBe(false);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/next/dist/server/next-server.js",
      ),
    ).toBe(false);
  });

  test("should work with pnpm store paths", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/.pnpm/@swc+core-darwin-arm64@1.3.0/node_modules/@swc/core-darwin-arm64/swc.node",
      ),
    ).toBe(true);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/.pnpm/@swc+core-linux-x64-gnu@1.3.0/node_modules/@swc/core-linux-x64-gnu/swc.node",
      ),
    ).toBe(false);
  });

  test("should handle unscoped platform packages", () => {
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/turbo-darwin-arm64/bin/turbo",
      ),
    ).toBe(true);
    expect(
      isNonLinuxPlatformPackage(
        "/project/node_modules/turbo-linux-x64/bin/turbo",
      ),
    ).toBe(false);
  });
});
