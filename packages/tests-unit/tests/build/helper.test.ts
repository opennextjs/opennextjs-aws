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
});
