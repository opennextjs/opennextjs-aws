import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

import {
  copyTracedFiles,
  isExcluded,
  isNonLinuxPlatformPackage,
} from "@opennextjs/aws/build/copyTracedFiles.js";

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

describe("copyTracedFiles", () => {
  let root: string;
  let appDir: string;
  let dotNextDir: string;
  let standaloneNextDir: string;
  let outputDir: string;

  function writeFile(filePath: string, content: unknown) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "open-next-copy-traced-"));
    appDir = path.join(root, "app");
    dotNextDir = path.join(appDir, ".next");
    standaloneNextDir = path.join(dotNextDir, "standalone/.next");
    outputDir = path.join(appDir, ".open-next/server-functions/default");

    writeFile(path.join(standaloneNextDir, "BUILD_ID"), "build-id");
    writeFile(path.join(standaloneNextDir, "required-server-files.json"), {
      config: { experimental: {} },
    });
    writeFile(path.join(standaloneNextDir, "server/pages-manifest.json"), {});
    writeFile(
      path.join(standaloneNextDir, "server/middleware-manifest.json"),
      {},
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const patchStub = path.join(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "../../../open-next/src/build/patch/patchedAsyncStorage.js",
  );
  const createdPatchStub = !fs.existsSync(patchStub);
  if (createdPatchStub) {
    fs.writeFileSync(patchStub, "// stub for tests\n");
  }
  afterAll(() => {
    if (createdPatchStub) {
      fs.rmSync(patchStub);
    }
  });
  function runCopyTracedFiles() {
    return copyTracedFiles({
      buildOutputPath: appDir,
      packagePath: "",
      outputDir,
      routes: [],
      bundledNextServer: false,
    });
  }

  test("copies traced files that resolve inside the output directory", async () => {
    writeFile(path.join(dotNextDir, "next-server.js.nft.json"), {
      version: 1,
      files: ["next-server.js", "../node_modules/some-pkg/index.js"],
    });
    writeFile(path.join(standaloneNextDir, "next-server.js"), "server");
    writeFile(
      path.join(dotNextDir, "standalone/node_modules/some-pkg/index.js"),
      "pkg",
    );

    const { tracedFiles } = await runCopyTracedFiles();

    const serverFile = path.join(outputDir, ".next/next-server.js");
    const pkgFile = path.join(outputDir, "node_modules/some-pkg/index.js");
    expect(tracedFiles).toContain(serverFile);
    expect(tracedFiles).toContain(pkgFile);
    expect(fs.readFileSync(serverFile, "utf8")).toBe("server");
    expect(fs.readFileSync(pkgFile, "utf8")).toBe("pkg");
  });

  test.each<[string, string[]]>([
    ["next-server.js", []],
    ["next-minimal-server.js", []],
    ["server/instrumentation.js", []],
    ["server/middleware.js", []],
    ["server/app/page.js", ["app/page"]],
    ["server/app/_not-found.js", ["app/page"]],
    ["server/app/_not-found/page.js", ["app/page"]],
    ["server/pages/404.js", ["pages/index"]],
    ["server/pages/500.js", ["pages/index"]],
  ])("refuses an escaping trace in %s", async (file, routes) => {
    const outsideSrc = path.join(
      root,
      "node_modules/next/dist/server/next-server.js",
    );
    writeFile(outsideSrc, "original next-server");
    writeFile(path.join(dotNextDir, "next-server.js.nft.json"), {
      version: 1,
      files: [],
    });
    for (const route of [
      ...routes,
      "pages/_app",
      "pages/_document",
      "pages/_error",
    ]) {
      writeFile(path.join(dotNextDir, `server/${route}.js.nft.json`), {
        files: [],
      });
      writeFile(path.join(standaloneNextDir, `server/${route}.js`), "route");
    }
    writeFile(path.join(standaloneNextDir, file), "route");
    writeFile(path.join(dotNextDir, `${file}.nft.json`), {
      version: 1,
      files: [
        path.relative(
          path.dirname(path.join(standaloneNextDir, file)),
          outsideSrc,
        ),
      ],
    });

    await expect(
      copyTracedFiles({
        buildOutputPath: appDir,
        packagePath: "",
        outputDir,
        routes,
        bundledNextServer: file === "next-minimal-server.js",
        skipServerFiles: file === "server/middleware.js",
      }),
    ).rejects.toThrow(/resolves outside the output directory/);

    expect(fs.existsSync(path.join(appDir, "node_modules"))).toBe(false);
    expect(fs.readFileSync(outsideSrc, "utf8")).toBe("original next-server");
  });
});
