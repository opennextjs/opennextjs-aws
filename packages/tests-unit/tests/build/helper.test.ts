import fs from "node:fs";
import path from "node:path";

import {
  compareSemver,
  copyCustomFiles,
} from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import mockFs from "mock-fs";
import { vi } from "vitest";

// We don't need to test canary versions, they are stripped out
describe("compareSemver", () => {
  test("=", () => {
    expect(compareSemver("1.0.0", "=", "1.0.0")).toBe(true);
    expect(compareSemver("1.1.0", "=", "1.0.0")).toBe(false);
    expect(compareSemver("1.0.1", "=", "1.0.0")).toBe(false);
  });

  it(">", () => {
    expect(compareSemver("1.0.1", ">", "1.0.0")).toBe(true);
    expect(compareSemver("1.0.0", ">", "1.0.0")).toBe(false);
    expect(compareSemver("1.0.0", ">", "1.0.1")).toBe(false);
  });

  it(">=", () => {
    expect(compareSemver("1.0.1", ">=", "1.0.0")).toBe(true);
    expect(compareSemver("1.0.0", ">=", "1.0.0")).toBe(true);
    expect(compareSemver("1.0.0", ">=", "1.0.1")).toBe(false);
  });

  it("<", () => {
    expect(compareSemver("1.0.0", "<", "1.0.1")).toBe(true);
    expect(compareSemver("1.0.0", "<", "1.0.0")).toBe(false);
    expect(compareSemver("1.0.0", "<", "0.0.1")).toBe(false);
  });

  it("<=", () => {
    expect(compareSemver("1.0.0", "<=", "1.0.1")).toBe(true);
    expect(compareSemver("1.0.0", "<=", "1.0.0")).toBe(true);
    expect(compareSemver("1.0.0", "<=", "0.0.1")).toBe(false);
  });

  test("latest", () => {
    expect(compareSemver("latest", "=", "1.0.0")).toBe(false);
    expect(compareSemver("latest", ">=", "1.0.0")).toBe(true);
    expect(compareSemver("latest", ">", "1.0.0")).toBe(true);
    expect(compareSemver("latest", "<=", "1.0.0")).toBe(false);
    expect(compareSemver("latest", "<", "1.0.0")).toBe(false);
  });

  test("incomplete version for patch", () => {
    expect(compareSemver("14.1.0", "=", "14.1")).toBe(true);
    expect(compareSemver("14.1", "=", "14.1.0")).toBe(true);
  });

  test("incomplete version for minor", () => {
    expect(compareSemver("14.0.0", "=", "14")).toBe(true);
    expect(compareSemver("14", "=", "14.0.0")).toBe(true);
  });

  test("throw if the major version is missing", () => {
    expect(() => compareSemver("incorrect", "=", "14.0.0")).toThrow();
    expect(() => compareSemver("14.0.0", "=", "latest")).toThrow();
  });

  test("throw if the major version is missing", () => {
    expect(() => compareSemver("incorrect", "=", "14.0.0")).toThrow();
    expect(() => compareSemver("14.0.0", "=", "latest")).toThrow();
  });

  test("throw if the operator is not supported", () => {
    expect(() => compareSemver("14.0.0", "==" as any, "14.0.0")).toThrow();
    expect(() => compareSemver("14.0.0", "!=" as any, "14.0.0")).toThrow();
  });
});

const outputFolder = ".open-next/server-functions/default";

describe("copyFiles", () => {
  beforeEach(() => {
    mockFs({
      "this/is/a/fake/dir": {
        "some-file24214.txt": "some content",
        "another-fil321313e.txt": "another content",
        "empty-file321441.txt": "",
        "important-js": {
          "another-important.js": "console.log('important!')",
        },
      },
      "this/is/a/real/dir": {
        "randomfile.txt": "some content",
        "another-dirfdsf": {
          "another-filedsfdsf.txt": "another content",
        },
        "empty-file.txtfdsf": "",
        "imporant-files": {
          "important.js": "console.log('important!')",
          "super-important.js": "console.log('super important!')",
        },
      },
      [`${outputFolder}/server`]: {
        "index.mjs": "globalThis.process.env = {}",
      },
    });

    vi.spyOn(fs, "copyFileSync");
    vi.spyOn(fs, "mkdirSync");
    vi.spyOn(fs, "readFileSync");
  });

  afterAll(() => {
    mockFs.restore();
    vi.restoreAllMocks();
  });

  it("should work with a glob, dstPath should become a directory", () => {
    copyCustomFiles(
      [
        {
          srcPath: "**/*.js",
          dstPath: "functions",
        },
      ],
      outputFolder,
    );

    const dstDir = path.join(outputFolder, "functions");
    expect(fs.copyFileSync).toHaveBeenCalledTimes(3);
    expect(fs.mkdirSync).toHaveBeenCalledWith(dstDir, { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);

    expect(fs.readdirSync(dstDir)).toEqual([
      "another-important.js",
      "important.js",
      "super-important.js",
    ]);

    expect(
      fs.readFileSync(path.join(dstDir, "important.js")).toString(),
    ).toMatchInlineSnapshot(`"console.log('important!')"`);
  });

  it("should copy a single file when srcPath matches one file", () => {
    copyCustomFiles(
      [
        {
          srcPath: "this/is/a/real/dir/randomfile.txt",
          dstPath: "randomfolder/randomfile.txt",
        },
      ],
      outputFolder,
    );

    const dstDir = path.join(outputFolder, "randomfolder");
    expect(fs.mkdirSync).toHaveBeenCalledWith(dstDir, { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);

    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "this/is/a/real/dir/randomfile.txt",
      path.join(outputFolder, "randomfolder/randomfile.txt"),
    );

    expect(
      fs.readFileSync(path.join(outputFolder, "randomfolder/randomfile.txt"), {
        encoding: "utf-8",
      }),
    ).toMatchInlineSnapshot(`"some content"`);
  });

  it("should work with a glob in a sub directory", () => {
    copyCustomFiles(
      [
        {
          srcPath: "this/is/a/real/dir/imporant-files/**/*.js",
          dstPath: "super/functions",
        },
      ],
      outputFolder,
    );

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join(outputFolder, "super/functions"),
      { recursive: true },
    );
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);

    expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "this/is/a/real/dir/imporant-files/important.js",
      path.join(outputFolder, "super/functions/important.js"),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "this/is/a/real/dir/imporant-files/super-important.js",
      path.join(outputFolder, "super/functions/super-important.js"),
    );

    expect(fs.readdirSync(path.join(outputFolder, "super/functions"))).toEqual([
      "important.js",
      "super-important.js",
    ]);
    expect(
      fs.readFileSync(
        path.join(outputFolder, "super/functions/super-important.js"),
        { encoding: "utf-8" },
      ),
    ).toMatchInlineSnapshot(`"console.log('super important!')"`);
  });
  it("should warn when file already exists", () => {
    const logSpy = vi.spyOn(logger, "warn");

    copyCustomFiles(
      [
        {
          srcPath: "this/is/a/fake/dir/some-file24214.txt",
          dstPath: "server/index.mjs",
        },
      ],
      outputFolder,
    );

    const fullDstPath = path.join(outputFolder, "server/index.mjs");
    expect(logSpy).toHaveBeenCalledWith(
      `File already exists: ${fullDstPath}. It will be overwritten.`,
    );
    logSpy.mockRestore();
  });
  it("should warn when no files are found", () => {
    const logSpy = vi.spyOn(logger, "warn");
    const srcPath = "path/to/dir/does-not-exist.txt";

    copyCustomFiles(
      [
        {
          srcPath: srcPath,
          dstPath: "server/index.mjs",
        },
      ],
      outputFolder,
    );

    expect(logSpy).toHaveBeenCalledWith(
      `No files found for pattern: ${srcPath}`,
    );
    logSpy.mockRestore();
  });
});
