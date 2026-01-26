import {
  compareSemver,
  isNextVersionSupported,
} from "@opennextjs/aws/build/helper.js";
import { afterEach, vi } from "vitest";

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
    mockDate("2026-10-21");
    expect(isNextVersionSupported("15.0.0")).toBe(true);

    mockDate("2026-10-22");
    expect(isNextVersionSupported("15.0.0")).toBe(false);
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
