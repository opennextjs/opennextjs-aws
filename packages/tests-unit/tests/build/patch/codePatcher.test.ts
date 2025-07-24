import {
  isVersionInRange,
  parseVersions,
} from "@opennextjs/aws/build/patch/codePatcher.js";

describe("isVersionInRange", () => {
  test("before", () => {
    expect(isVersionInRange("14.5", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("14.5.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("15", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("15.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("15.0.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("15.5", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("15.5.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("16", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("16.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("16.0.0", "<=16.0.0")).toBe(true);
    expect(isVersionInRange("16.5", "<=16.0.0")).toBe(false);
    expect(isVersionInRange("16.5.0", "<=16.0.0")).toBe(false);
  });

  test("after", () => {
    expect(isVersionInRange("14.5", ">=15.0.0")).toBe(false);
    expect(isVersionInRange("14.5.0", ">=15.0.0")).toBe(false);
    expect(isVersionInRange("15", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("15.0", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("15.0.0", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("15.5", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("15.5.0", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("16", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("16.0", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("16.0.0", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("16.5", ">=15.0.0")).toBe(true);
    expect(isVersionInRange("16.5.0", ">=15.0.0")).toBe(true);
  });

  test("before and after", () => {
    expect(isVersionInRange("14.5", ">=15.0.0 <=16.0.0")).toBe(false);
    expect(isVersionInRange("14.5.0", ">=15.0.0 <=16.0.0")).toBe(false);
    expect(isVersionInRange("15", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("15.0", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("15.0.0", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("15.5", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("15.5.0", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("16", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("16.0", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("16.0.0", ">=15.0.0 <=16.0.0")).toBe(true);
    expect(isVersionInRange("16.5", ">=15.0.0 <=16.0.0")).toBe(false);
    expect(isVersionInRange("16.5.0", ">=15.0.0 <=16.0.0")).toBe(false);
  });

  test("undefined range", () => {
    expect(isVersionInRange("14.5", undefined)).toBe(true);
  });
});

describe("parseVersions", () => {
  it("should throw an error if a single version range is invalid because of a space before", () => {
    expect(() => parseVersions("<= 15.0.0")).toThrow("Invalid version range");
  });

  it("should throw an error if a single version range is invalid because of a space inside version", () => {
    expect(() => parseVersions(">=16.   0.0")).toThrow("Invalid version range");
  });

  it("should throw an error if one of the version range is invalid because of a space before the version", () => {
    expect(() => parseVersions(">=16.0.0 <= 15.0.0")).toThrow(
      "Invalid version range",
    );
  });
});
