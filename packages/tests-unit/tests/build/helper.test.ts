import { compareSemver } from "@opennextjs/aws/build/helper.js";

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
