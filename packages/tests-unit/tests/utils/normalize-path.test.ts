import { decodePathParams } from "@opennextjs/aws/utils/normalize-path.js";

describe("decodePathParams", () => {
  it.each([
    ["/learn/Finance/bitcoin", "/learn/Finance/bitcoin"],
    ["/learn/Finance%20101/bitcoin", "/learn/Finance 101/bitcoin"],
    ["/learn/Pr%C3%A9sentation", "/learn/Présentation"],
    ["/learn/Fin%61nce", "/learn/Finance"],
    ["/learn/Finance%2520101", "/learn/Finance%20101"],
  ])("should decode %s", (path, expected) => {
    expect(decodePathParams(path)).toBe(expected);
  });

  it.each([
    ["/learn/a%2Fb", "/learn/a%2Fb"],
    ["/learn/a%2fb", "/learn/a%2Fb"],
    ["/learn/a%23b", "/learn/a%23b"],
    ["/learn/a%3Fb", "/learn/a%3Fb"],
    ["/learn/%61%2F%62", "/learn/a%2Fb"],
  ])("should keep path delimiters encoded in %s", (path, expected) => {
    expect(decodePathParams(path)).toBe(expected);
  });

  it("should throw on a malformed escape sequence", () => {
    expect(() => decodePathParams("/learn/%E0%A4%A")).toThrow(URIError);
  });
});
