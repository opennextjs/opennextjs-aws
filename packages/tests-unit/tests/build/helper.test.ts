import { compareSemver } from "@opennextjs/aws/build/helper.js";

// We don't need to test canary versions, they are stripped out
describe("compareSemver", () => {
  it("should return 0 when versions are equal", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("should return 1 when first version is greater", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
  });

  it("should return -1 when first version is smaller", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
  });

  it("should work with latest", () => {
    expect(compareSemver("latest", "1.0.0")).toBe(1);
  });

  it("should work with incomplete version for patch", () => {
    expect(compareSemver("14.1.0", "14.1")).toBe(0);
    expect(compareSemver("14.1", "14.1.0")).toBe(0);
  });

  it("should work with incomplete version for minor", () => {
    expect(compareSemver("14.0.0", "14")).toBe(0);
  });

  it("should throw if the major version is missing", () => {
    expect(() => compareSemver("incorrect", "14.0.0")).toThrow();
    expect(() => compareSemver("14.0.0", "latest")).toThrow();
  });
});
