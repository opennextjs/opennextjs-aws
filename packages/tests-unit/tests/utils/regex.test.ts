import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

const specialChars = "^([123]+|[123]{1,3})*\\?$";

describe("getCrossPlatformPathRegex", () => {
  it("should return a regex without escaping characters", () => {
    const regexp = getCrossPlatformPathRegex(specialChars, { escape: false });
    expect(regexp.source).toEqual(specialChars);
  });

  it("should always create cross-platform separators", () => {
    [true, false].forEach((v) => {
      const regexp = getCrossPlatformPathRegex("test/path", { escape: v });
      expect(regexp.source).toEqual(String.raw`test(?:\/|\\)path`);
    });
  });

  it("should return a regex with escaped characters", () => {
    const regexp = getCrossPlatformPathRegex(specialChars, { escape: true });
    expect(regexp.source).toEqual(
      String.raw`\^\(\[123\]\+\|\[123\]\{1,3\}\)\*\\\?\$`,
    );
  });
});
