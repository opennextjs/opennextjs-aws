import { extractVersionedField } from "@opennextjs/aws/build/patch/codePatcher.js";

describe("extractVersionedField", () => {
  it("should return the field if the version is between before and after", () => {
    const result = extractVersionedField(
      [{ versions: ">=15.0.0 <=16.0.0", field: 0 }],
      "15.5.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return an empty array if the version is not between before and after", () => {
    const result = extractVersionedField(
      [{ versions: ">=15.0.0 <=16.0.0", field: 0 }],
      "14.0.0",
    );

    expect(result).toEqual([]);
  });

  it("should return the field if the version is equal to before", () => {
    const result = extractVersionedField(
      [{ versions: "<=15.0.0", field: 0 }],
      "15.0.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return the field if the version is greater than after", () => {
    const result = extractVersionedField(
      [{ versions: ">=16.0.0", field: 0 }],
      "16.5.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return the field if the version is less than before", () => {
    const result = extractVersionedField(
      [{ versions: "<=15.0.0", field: 0 }],
      "14.0.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return an empty array if version is after before", () => {
    const result = extractVersionedField(
      [{ versions: "<=15.0.0", field: 0 }],
      "15.1.0",
    );

    expect(result).toEqual([]);
  });

  it("should return the field when versions is not specified", () => {
    const result = extractVersionedField([{ field: 0 }], "15.1.0");

    expect(result).toEqual([0]);
  });

  it("should throw an error if a single version range is invalid because of a space before", () => {
    expect(() =>
      extractVersionedField([{ versions: "<= 15.0.0", field: 0 }], "15.0.0"),
    ).toThrow("Invalid version range");
  });

  it("should throw an error if a single version range is invalid because of a space inside version", () => {
    expect(() =>
      extractVersionedField([{ versions: ">=16.   0.0", field: 0 }], "15.0.0"),
    ).toThrow("Invalid version range");
  });

  it("should throw an error if one of the version range is invalid because of a space before the version", () => {
    expect(() =>
      extractVersionedField(
        [{ versions: ">=16.0.0 <= 15.0.0", field: 0 }],
        "15.0.0",
      ),
    ).toThrow("Invalid version range");
  });
});
