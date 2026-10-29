import { parseArgs } from "@opennextjs/aws/utils/args.js";

describe("parseArgs", () => {
  test("returns defaults when no flags are passed", () => {
    expect(parseArgs(["build"])).toEqual({
      configPath: undefined,
      nodeExternals: undefined,
      help: false,
      dangerouslyUseUnsupportedNextVersion: false,
    });
  });

  test("parses value flags", () => {
    expect(
      parseArgs([
        "build",
        "--config-path",
        "./open-next.config.ts",
        "--node-externals",
        "sharp,sqlite3",
      ]),
    ).toEqual({
      configPath: "./open-next.config.ts",
      nodeExternals: "sharp,sqlite3",
      help: false,
      dangerouslyUseUnsupportedNextVersion: false,
    });
  });

  test("value flag without a value is undefined", () => {
    expect(parseArgs(["build", "--config-path"]).configPath).toBeUndefined();
    expect(
      parseArgs(["build", "--config-path", "--node-externals", "sharp"]),
    ).toMatchObject({ configPath: undefined, nodeExternals: "sharp" });
  });

  describe("--dangerously-use-unsupported-next-version", () => {
    test("is true when passed as the last argument", () => {
      expect(
        parseArgs(["build", "--dangerously-use-unsupported-next-version"])
          .dangerouslyUseUnsupportedNextVersion,
      ).toBe(true);
    });

    test("is true when followed by another flag", () => {
      expect(
        parseArgs([
          "build",
          "--dangerously-use-unsupported-next-version",
          "--config-path",
          "./open-next.config.ts",
        ]),
      ).toMatchObject({
        dangerouslyUseUnsupportedNextVersion: true,
        configPath: "./open-next.config.ts",
      });
    });

    test("does not consume the following argument", () => {
      expect(
        parseArgs([
          "build",
          "--dangerously-use-unsupported-next-version",
          "--node-externals",
          "sharp",
        ]),
      ).toMatchObject({
        dangerouslyUseUnsupportedNextVersion: true,
        nodeExternals: "sharp",
      });
      expect(
        parseArgs(["build", "--dangerously-use-unsupported-next-version", "x"])
          .dangerouslyUseUnsupportedNextVersion,
      ).toBe(true);
    });

    test("is false when absent", () => {
      expect(
        parseArgs(["build", "--config-path", "./open-next.config.ts"])
          .dangerouslyUseUnsupportedNextVersion,
      ).toBe(false);
    });
  });

  describe("--help", () => {
    test("is true when present", () => {
      expect(parseArgs(["build", "--help"]).help).toBe(true);
    });

    test("is not consumed as the value of a preceding flag", () => {
      expect(parseArgs(["build", "--config-path", "--help"])).toMatchObject({
        configPath: undefined,
        help: true,
      });
    });

    test("does not consume the following argument", () => {
      expect(
        parseArgs(["build", "--help", "--config-path", "x"]),
      ).toMatchObject({ help: true, configPath: "x" });
    });
  });
});
