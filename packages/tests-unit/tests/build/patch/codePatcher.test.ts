import { extractVersionedField } from "@opennextjs/aws/build/patch/codePatcher.js";

describe("extractVersionedField", () => {
  it("should return the field if the version is between before and after", () => {
    const result = extractVersionedField(
      [{ before: "16.0.0", after: "15.0.0", field: 0 }],
      "15.5.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return the field if the version is equal to before", () => {
    const result = extractVersionedField(
      [{ before: "15.0.0", after: "16.0.0", field: 0 }],
      "15.0.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return the field if the version is greater than after", () => {
    const result = extractVersionedField(
      [{ after: "16.0.0", field: 0 }],
      "16.5.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return the field if the version is less than before", () => {
    const result = extractVersionedField(
      [{ before: "15.0.0", field: 0 }],
      "14.0.0",
    );

    expect(result).toEqual([0]);
  });

  it("should return an empty array if version is after before", () => {
    const result = extractVersionedField(
      [{ before: "15.0.0", field: 0 }],
      "15.1.0",
    );

    expect(result).toEqual([]);
  });
});
