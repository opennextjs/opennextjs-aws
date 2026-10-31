import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import {
  computePatchDiff,
  getInstalledNextPackages,
  getNextFilesToPatch,
} from "@opennextjs/aws/build/patch/testUtils.js";

/**
 * Write the files to the directory, creating the parent directories.
 *
 * @param dir Root directory
 * @param files Content of the files, keyed by path relative to `dir`
 */
function writeFiles(dir: string, files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
}

const nextPackageJson = (version: string) =>
  JSON.stringify({ name: "next", version });

let root: string;

beforeEach(() => {
  // `require.resolve` returns real paths (i.e. `/private/var` on macOS).
  root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "open-next-test-utils-")),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("computePatchDiff", () => {
  test("returns the diff of the patched code", () => {
    const rule = `
rule:
  pattern: console.log($A)
fix: console.error($A)
`;
    expect(
      computePatchDiff("file.js", "console.log(1);", rule),
    ).toMatchInlineSnapshot(`
        "Index: file.js
        ===================================================================
        --- file.js
        +++ file.js
        @@ -1,1 +1,1 @@
        -console.log(1);
        \\ No newline at end of file
        +console.error(1);
        \\ No newline at end of file
        "
      `);
  });
});

describe("getInstalledNextPackages", () => {
  test("resolves next from each app and deduplicates by version", () => {
    writeFiles(root, {
      "app15/package.json": "{}",
      "app15/node_modules/next/package.json": nextPackageJson("15.5.28"),
      "app16/package.json": "{}",
      "app16/node_modules/next/package.json": nextPackageJson("16.4.1"),
      // Same version installed in another directory
      "app16-bis/package.json": "{}",
      "app16-bis/node_modules/next/package.json": nextPackageJson("16.4.1"),
    });

    expect(
      getInstalledNextPackages(
        ["app15", "app16", "app16-bis"].map((app) => path.join(root, app)),
      ),
    ).toEqual([
      { dir: path.join(root, "app15/node_modules/next"), version: "15.5.28" },
      { dir: path.join(root, "app16/node_modules/next"), version: "16.4.1" },
    ]);
  });

  test("accepts directories relative to the current working directory", () => {
    writeFiles(root, {
      "app/package.json": "{}",
      "app/node_modules/next/package.json": nextPackageJson("16.4.1"),
    });

    expect(
      getInstalledNextPackages([path.relative(process.cwd(), `${root}/app`)]),
    ).toEqual([
      { dir: path.join(root, "app/node_modules/next"), version: "16.4.1" },
    ]);
  });

  test("throws when next is not installed", () => {
    writeFiles(root, { "app/package.json": "{}" });

    expect(() => getInstalledNextPackages([path.join(root, "app")])).toThrow();
  });
});

describe("getNextFilesToPatch", () => {
  test("selects files by version, path and content", () => {
    const dir = path.join(root, "next");
    writeFiles(dir, {
      "package.json": nextPackageJson("16.4.1"),
      "dist/server/match.js": "const target = 1;",
      "dist/server/no-content-match.js": "const other = 1;",
      "dist/client/match.js": "const target = 1;",
    });
    const patch = {
      pathFilter: /dist\/server\/.*\.js$/,
      contentFilter: /target/,
      patchCode: async ({ code }: { code: string }) => code,
    };
    const codePatcher: CodePatcher = {
      name: "test",
      patches: [
        { ...patch, versions: ">=16.0.0" },
        // Not applied: version out of range
        { ...patch, versions: "<=15.0.0" },
      ],
    };

    const files = getNextFilesToPatch({ dir, version: "16.4.1" }, codePatcher);

    expect(files).toEqual([
      {
        name: path.normalize("dist/server/match.js"),
        code: "const target = 1;",
        patches: [codePatcher.patches[0]],
      },
    ]);
  });
});
