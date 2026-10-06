import fs from "node:fs";

import {
  getTracedSourceMap,
  isExcluded,
  isNonLinuxPlatformPackage,
} from "@opennextjs/aws/build/copyTracedFiles.js";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs");

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

describe("getTracedSourceMap", () => {
  const dotNextDir = "/project/apps/web/.next";

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  test("returns the sibling .map of a traced .js file inside .next", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === "/project/apps/web/.next/server/chunks/123.js.map",
    );

    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/apps/web/.next/server/chunks/123.js",
      ),
    ).toBe("/project/apps/web/.next/server/chunks/123.js.map");
  });

  test("supports .mjs and .cjs files", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(
      getTracedSourceMap(dotNextDir, "/project/apps/web/.next/server/a.mjs"),
    ).toBe("/project/apps/web/.next/server/a.mjs.map");
    expect(
      getTracedSourceMap(dotNextDir, "/project/apps/web/.next/server/b.cjs"),
    ).toBe("/project/apps/web/.next/server/b.cjs.map");
  });

  test("returns undefined when no .map exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/apps/web/.next/server/chunks/123.js",
      ),
    ).toBeUndefined();
  });

  test("ignores files that are not JavaScript", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(
      getTracedSourceMap(dotNextDir, "/project/apps/web/.next/server/x.json"),
    ).toBeUndefined();
    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/apps/web/.next/server/chunks/123.js.map",
      ),
    ).toBeUndefined();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  test("ignores traced files outside of .next, such as node_modules", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/node_modules/some-lib/dist/index.js",
      ),
    ).toBeUndefined();
    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/apps/web/node_modules/other-lib/index.js",
      ),
    ).toBeUndefined();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  test("handles traced paths that climb out of and back into .next", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // .nft.json entries are relative, e.g. "../../chunks/1.js", and get joined
    // onto the nft file's directory; the resolved path is what matters.
    expect(
      getTracedSourceMap(
        dotNextDir,
        "/project/apps/web/.next/server/app/../../server/chunks/1.js",
      ),
    ).toBe("/project/apps/web/.next/server/app/../../server/chunks/1.js.map");
  });
});
