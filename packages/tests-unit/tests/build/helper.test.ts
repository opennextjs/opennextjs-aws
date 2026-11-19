import fs from "node:fs";
import {
  compareSemver,
  findNextConfig,
  getBundlerRuntime,
  isNextVersionSupported,
} from "@opennextjs/aws/build/helper.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { afterEach, vi } from "vitest";

vi.mock("node:fs");

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

describe("isNextVersionSupported", () => {
  const mockDate = (dateStr: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(dateStr));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns true for version released less than 2 years ago", () => {
    mockDate("2026-01-26");

    expect(isNextVersionSupported("16.0.0")).toBe(true);
    expect(isNextVersionSupported("16.1.5")).toBe(true);

    expect(isNextVersionSupported("15.0.0")).toBe(true);
    expect(isNextVersionSupported("15.5.9")).toBe(true);
  });

  test("returns false for version released more than 2 years ago", () => {
    mockDate("2026-01-26");

    expect(isNextVersionSupported("14.0.0")).toBe(false);
    expect(isNextVersionSupported("14.2.3")).toBe(false);
    expect(isNextVersionSupported("13.0.0")).toBe(false);
    expect(isNextVersionSupported("13.5.6")).toBe(false);
  });

  test("handles boundary case - exactly 2 years", () => {
    mockDate("2025-10-26");
    expect(isNextVersionSupported("14.0.0")).toBe(true);

    mockDate("2025-10-27");
    expect(isNextVersionSupported("14.0.0")).toBe(false);
  });

  test("keeps supporting a version older than 2 years until the second next major is released", () => {
    mockDate("2026-10-22");
    expect(isNextVersionSupported("15.0.0")).toBe(true);
    expect(isNextVersionSupported("15.5.28")).toBe(true);
    expect(isNextVersionSupported("16.0.0")).toBe(true);
    expect(isNextVersionSupported("14.0.0")).toBe(false);

    mockDate("2030-01-01");
    expect(isNextVersionSupported("15.0.0")).toBe(true);
    expect(isNextVersionSupported("16.0.0")).toBe(true);
    expect(isNextVersionSupported("14.0.0")).toBe(false);
  });

  test("returns false for unknown major versions", () => {
    mockDate("2026-01-26");
    expect(isNextVersionSupported("999.0.0")).toBe(false);
    expect(isNextVersionSupported("0.1.0")).toBe(false);
    expect(isNextVersionSupported("17.0.0")).toBe(false); // Not released yet
  });

  test("handles older versions correctly", () => {
    mockDate("2026-01-26");
    expect(isNextVersionSupported("12.0.0")).toBe(false);
    expect(isNextVersionSupported("11.0.0")).toBe(false);
    expect(isNextVersionSupported("10.0.0")).toBe(false);
    expect(isNextVersionSupported("9.0.0")).toBe(false);
  });
});

describe("findNextConfig", () => {
  const appPath = "/test/app";

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  test("returns next.config.js when it exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/app/next.config.js",
    );

    expect(findNextConfig({ appPath })).toEqual({
      path: "/test/app/next.config.js",
      isTypescript: false,
    });
  });

  test("returns next.config.cjs when it exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/app/next.config.cjs",
    );

    expect(findNextConfig({ appPath })).toEqual({
      path: "/test/app/next.config.cjs",
      isTypescript: false,
    });
  });

  test("returns next.config.mjs when it exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/app/next.config.mjs",
    );

    expect(findNextConfig({ appPath })).toEqual({
      path: "/test/app/next.config.mjs",
      isTypescript: false,
    });
  });

  test("returns next.config.ts when it exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/app/next.config.ts",
    );

    expect(findNextConfig({ appPath })).toEqual({
      path: "/test/app/next.config.ts",
      isTypescript: true,
    });
  });

  test("returns undefined when no config file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(findNextConfig({ appPath })).toBeUndefined();
  });

  test("returns one of matching extension when multiple configs exist", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) =>
        filePath === "/test/app/next.config.js" ||
        filePath === "/test/app/next.config.ts",
    );

    expect(findNextConfig({ appPath })).toEqual({
      path: "/test/app/next.config.ts",
      isTypescript: true,
    });
  });
});

describe("getBundlerRuntime", () => {
  const options = {
    appPath: "/test/app",
    appBuildOutputPath: "/test/output",
  } as BuildOptions;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  test("returns webpack when the webpack runtime exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/output/.next/server/webpack-runtime.js",
    );

    expect(getBundlerRuntime(options)).toBe("webpack");
  });

  test("returns turbopack when the turbopack runtime exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) =>
        filePath === "/test/output/.next/server/chunks/[turbopack]_runtime.js",
    );

    expect(getBundlerRuntime(options)).toBe("turbopack");
  });

  test("returns turbopack when the ssr turbopack runtime exists", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) =>
        filePath ===
        "/test/output/.next/server/chunks/ssr/[turbopack]_runtime.js",
    );

    expect(getBundlerRuntime(options)).toBe("turbopack");
  });

  test("ignores the .next folder in appPath when buildOutputPath differs", () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (filePath) => filePath === "/test/app/.next/server/webpack-runtime.js",
    );

    expect(() => getBundlerRuntime(options)).toThrow(
      "Unable to determine Next.js runtime (webpack or turbopack)",
    );
  });
});
