import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  copyTracedFiles,
  isExcluded,
  isNonLinuxPlatformPackage,
} from "@opennextjs/aws/build/copyTracedFiles.js";
import logger from "@opennextjs/aws/logger.js";
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

  const tracedPage = "app/_global-error/page";
  const tracedSubDir = "server/app/_global-error";

  function writeTracedPage(files: string[]) {
    const nftDir = path.join(buildOutputPath, ".next", tracedSubDir);
    mkdirSync(nftDir, { recursive: true });
    writeFileSync(
      path.join(nftDir, "page.js.nft.json"),
      JSON.stringify({ files }),
    );
    const standalonePageDir = path.join(standaloneNextDir, tracedSubDir);
    mkdirSync(standalonePageDir, { recursive: true });
    writeFileSync(path.join(standalonePageDir, "page.js"), "page");
  }

  function copyTracedPage() {
    return copyTracedFiles({
      buildOutputPath,
      packagePath: "",
      outputDir,
      routes: [tracedPage],
      bundledNextServer: false,
      skipServerFiles: true,
    });
  }

  it("copies a traced file missing from standalone out of .next", async () => {
    writeTracedPage(["../../chunks/only-in-dot-next.js"]);
    const source = path.join(
      buildOutputPath,
      ".next/server/chunks/only-in-dot-next.js",
    );
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, "from-dot-next");

    await copyTracedPage();

    expect(
      readFileSync(
        path.join(outputDir, ".next/server/chunks/only-in-dot-next.js"),
        "utf8",
      ),
    ).toBe("from-dot-next");
  });

  it("keeps a traced file that is present in standalone", async () => {
    writeTracedPage(["../../chunks/in-both.js"]);
    const standaloneSource = path.join(
      standaloneNextDir,
      "server/chunks/in-both.js",
    );
    const dotNextSource = path.join(
      buildOutputPath,
      ".next/server/chunks/in-both.js",
    );
    mkdirSync(path.dirname(standaloneSource), { recursive: true });
    mkdirSync(path.dirname(dotNextSource), { recursive: true });
    writeFileSync(standaloneSource, "from-standalone");
    writeFileSync(dotNextSource, "from-dot-next");

    await copyTracedPage();

    expect(
      readFileSync(
        path.join(outputDir, ".next/server/chunks/in-both.js"),
        "utf8",
      ),
    ).toBe("from-standalone");
  });

  it("leaves a traced file missing from both standalone and .next uncopied", async () => {
    writeTracedPage(["../../chunks/missing.js"]);
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});

    await expect(copyTracedPage()).resolves.toBeDefined();

    expect(
      existsSync(path.join(outputDir, ".next/server/chunks/missing.js")),
    ).toBe(false);
    expect(debug).toHaveBeenCalledWith(
      "Error copying file:",
      expect.objectContaining({ code: "ENOENT" }),
    );
    debug.mockRestore();
  });

  it("recreates a pnpm-style symlink when the .next fallback is a symlink", async () => {
    writeTracedPage(["../../chunks/linked.js"]);
    const chunkDir = path.join(buildOutputPath, ".next/server/chunks");
    mkdirSync(chunkDir, { recursive: true });
    writeFileSync(path.join(chunkDir, "real.js"), "target");
    symlinkSync("real.js", path.join(chunkDir, "linked.js"));

    await copyTracedPage();

    const copied = path.join(outputDir, ".next/server/chunks/linked.js");
    expect(lstatSync(copied).isSymbolicLink()).toBe(true);
    expect(readlinkSync(copied)).toBe("real.js");
  });

  it("does not fall back to node_modules outside .next", async () => {
    writeTracedPage(["../../../../node_modules/leftpad/index.js"]);
    const outsideNext = path.join(
      buildOutputPath,
      "node_modules/leftpad/index.js",
    );
    mkdirSync(path.dirname(outsideNext), { recursive: true });
    writeFileSync(outsideNext, "do-not-copy");

    await copyTracedPage();

    expect(
      existsSync(path.join(outputDir, "node_modules/leftpad/index.js")),
    ).toBe(false);
  });

  it("does not copy a traced path that escapes the project", async () => {
    const outsideDir = mkdtempSync(
      path.join(os.tmpdir(), "open-next-outside-"),
    );
    const secret = path.join(outsideDir, "secret.txt");
    writeFileSync(secret, "secret");
    const fromDir = path.join(standaloneNextDir, tracedSubDir);
    mkdirSync(fromDir, { recursive: true });
    writeTracedPage([path.relative(fromDir, secret)]);

    await copyTracedPage();

    expect(readFileSync(secret, "utf8")).toBe("secret");
    expect(
      existsSync(
        path.resolve(
          path.join(outputDir, ".next", tracedSubDir),
          path.relative(fromDir, secret),
        ),
      ),
    ).toBe(false);
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("copies a traced file recorded with Windows separators from .next", async () => {
    writeTracedPage(["..\\..\\chunks\\win-chunk.js"]);
    const source = path.join(
      buildOutputPath,
      ".next/server/chunks/win-chunk.js",
    );
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, "from-windows-trace");

    await copyTracedPage();

    expect(
      readFileSync(
        path.join(outputDir, ".next/server/chunks/win-chunk.js"),
        "utf8",
      ),
    ).toBe("from-windows-trace");
  });

  it("skips the middleware trace when /_middleware is not in functions-config", async () => {
    const dotNextServer = path.join(buildOutputPath, ".next/server");
    mkdirSync(dotNextServer, { recursive: true });
    writeFileSync(
      path.join(dotNextServer, "middleware.js"),
      "turbopack middleware stub",
    );
    writeFileSync(
      path.join(dotNextServer, "middleware.js.nft.json"),
      JSON.stringify({ files: ["./chunks/middleware-only.js"] }),
    );
    writeFileSync(
      path.join(dotNextServer, "functions-config-manifest.json"),
      JSON.stringify({ version: 1, functions: {} }),
    );

    await expect(copy()).resolves.toBeDefined();

    expect(existsSync(path.join(outputDir, ".next/server/middleware.js"))).toBe(
      false,
    );
  });

  it("copies node middleware when /_middleware is registered", async () => {
    const dotNextServer = path.join(buildOutputPath, ".next/server");
    mkdirSync(path.join(dotNextServer, "chunks"), { recursive: true });
    mkdirSync(path.join(standaloneNextDir, "server/chunks"), {
      recursive: true,
    });
    writeFileSync(path.join(standaloneNextDir, "server/middleware.js"), "mw");
    writeFileSync(
      path.join(standaloneNextDir, "server/chunks/mw.js"),
      "mw-chunk",
    );
    writeFileSync(
      path.join(dotNextServer, "middleware.js.nft.json"),
      JSON.stringify({ files: ["./chunks/mw.js"] }),
    );
    writeFileSync(
      path.join(dotNextServer, "functions-config-manifest.json"),
      JSON.stringify({
        version: 1,
        functions: { "/_middleware": { runtime: "nodejs" } },
      }),
    );

    await copy();

    expect(
      readFileSync(path.join(outputDir, ".next/server/middleware.js"), "utf8"),
    ).toBe("mw");
    expect(
      readFileSync(path.join(outputDir, ".next/server/chunks/mw.js"), "utf8"),
    ).toBe("mw-chunk");
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
