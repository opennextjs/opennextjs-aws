import { removeUndefinedFromQuery } from "@opennextjs/aws/converters/utils.js";

describe("removeUndefinedFromQuery", () => {
  it("should remove undefined from query", () => {
    const result = removeUndefinedFromQuery({
      a: "1",
      b: ["2", "3"],
      c: undefined,
    });

    expect(result).toEqual({
      a: "1",
      b: ["2", "3"],
    });
  });

  it("should return empty object if input is empty", () => {
    const result = removeUndefinedFromQuery({});

    expect(result).toEqual({});
  });

  it("should return empty object if all values are undefined", () => {
    const result = removeUndefinedFromQuery({
      a: undefined,
      b: undefined,
    });

    expect(result).toEqual({});
  });
});
