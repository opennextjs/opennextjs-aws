import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { augmentWithImportsRemaps } from "@opennextjs/aws/build/augmentWithImportsRemaps.js";

function ensureDir(...parts: string[]): string {
  const dir = path.join(...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(value));
}

function writeSource(file: string, content = "// noop\n"): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, content);
}

describe("augmentWithImportsRemaps", () => {
  let projectRoot: string;
  // Bogus prefix used only as `filesToCopy` Map values - never read or written
  // by the function under test, just compared as strings.
  const fakeOutRoot = "/__never-written__";

  beforeEach(() => {
    // realpath because on macOS `tmpdir()` is a symlink (`/var/...` →
    // `/private/var/...`) but `require.resolve` returns the realpath form;
    // we need both sides of the test to agree.
    projectRoot = realpathSync(
      mkdtempSync(path.join(tmpdir(), "augment-imports-")),
    );
    writeJson(path.join(projectRoot, "package.json"), {
      name: "test-app",
      version: "0.0.0",
    });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test.each([
    {
      label: "unscoped consumer",
      consumerRelPath: "node_modules/consumer/package.json",
      consumerName: "consumer",
    },
    {
      label: "scoped consumer (dst hops up two levels)",
      consumerRelPath: "node_modules/@scope/consumer/package.json",
      consumerName: "@scope/consumer",
    },
  ])(
    "places remap target next to $label",
    ({ consumerRelPath, consumerName }) => {
      const consumerPkg = path.join(projectRoot, consumerRelPath);
      writeJson(consumerPkg, {
        name: consumerName,
        imports: { "#foo/*": "target-pkg/sub/*" },
      });

      const targetDir = ensureDir(projectRoot, "node_modules/target-pkg");
      writeJson(path.join(targetDir, "package.json"), { name: "target-pkg" });
      writeSource(path.join(targetDir, "sub/file.js"));
      writeSource(path.join(targetDir, "other.js"));

      const filesToCopy = new Map<string, string>([
        [consumerPkg, path.join(fakeOutRoot, consumerRelPath)],
      ]);

      augmentWithImportsRemaps(filesToCopy, projectRoot);

      // target-pkg files land under `<fakeOutRoot>/node_modules/target-pkg/...`
      // regardless of whether the consumer was scoped.
      expect(filesToCopy.get(path.join(targetDir, "sub/file.js"))).toBe(
        path.join(fakeOutRoot, "node_modules/target-pkg/sub/file.js"),
      );
      expect(filesToCopy.get(path.join(targetDir, "other.js"))).toBe(
        path.join(fakeOutRoot, "node_modules/target-pkg/other.js"),
      );
      expect(filesToCopy.get(path.join(targetDir, "package.json"))).toBe(
        path.join(fakeOutRoot, "node_modules/target-pkg/package.json"),
      );
    },
  );

  test("follows transitive remaps via newly-discovered package.json files", () => {
    // consumer -> target-a (via imports), target-a -> target-b (via imports).
    const consumerPkg = path.join(
      projectRoot,
      "node_modules/consumer/package.json",
    );
    writeJson(consumerPkg, {
      name: "consumer",
      imports: { "#a/*": "target-a/*" },
    });

    const targetA = ensureDir(projectRoot, "node_modules/target-a");
    writeJson(path.join(targetA, "package.json"), {
      name: "target-a",
      imports: { "#b/*": "target-b/*" },
    });
    writeSource(path.join(targetA, "a.js"));

    const targetB = ensureDir(projectRoot, "node_modules/target-b");
    writeJson(path.join(targetB, "package.json"), { name: "target-b" });
    writeSource(path.join(targetB, "b.js"));

    const filesToCopy = new Map<string, string>([
      [
        consumerPkg,
        path.join(fakeOutRoot, "node_modules/consumer/package.json"),
      ],
    ]);

    augmentWithImportsRemaps(filesToCopy, projectRoot);

    expect(filesToCopy.get(path.join(targetA, "a.js"))).toBe(
      path.join(fakeOutRoot, "node_modules/target-a/a.js"),
    );
    expect(filesToCopy.get(path.join(targetB, "b.js"))).toBe(
      path.join(fakeOutRoot, "node_modules/target-b/b.js"),
    );
  });

  test("ignores non-resolvable targets without polluting the map", () => {
    const consumerPkg = path.join(
      projectRoot,
      "node_modules/consumer/package.json",
    );
    writeJson(consumerPkg, {
      name: "consumer",
      imports: {
        "#local/*": "./internal/*",
        "#parent/*": "../sibling/*",
        "#abs/*": "/etc/passwd",
        "#chained": "#other",
        "#bareScope": "@scope", // scoped specifier with no package segment
      },
    });

    const filesToCopy = new Map<string, string>([
      [
        consumerPkg,
        path.join(fakeOutRoot, "node_modules/consumer/package.json"),
      ],
    ]);
    const sizeBefore = filesToCopy.size;

    expect(() =>
      augmentWithImportsRemaps(filesToCopy, projectRoot),
    ).not.toThrow();
    // No resolvable bare-specifier targets -> no new files.
    expect(filesToCopy.size).toBe(sizeBefore);
  });

  test("does not overwrite existing dst entries already in filesToCopy", () => {
    const consumerPkg = path.join(
      projectRoot,
      "node_modules/consumer/package.json",
    );
    writeJson(consumerPkg, {
      name: "consumer",
      imports: { "#foo": "target-pkg/file.js" },
    });

    const targetDir = ensureDir(projectRoot, "node_modules/target-pkg");
    writeJson(path.join(targetDir, "package.json"), { name: "target-pkg" });
    writeSource(path.join(targetDir, "file.js"));

    // Pretend NFT already mapped target-pkg/file.js to a different destination.
    const nftDst = path.join(fakeOutRoot, "nft-mapped/target-pkg/file.js");
    const filesToCopy = new Map<string, string>([
      [
        consumerPkg,
        path.join(fakeOutRoot, "node_modules/consumer/package.json"),
      ],
      [path.join(targetDir, "file.js"), nftDst],
    ]);

    augmentWithImportsRemaps(filesToCopy, projectRoot);

    // The pre-existing mapping wins.
    expect(filesToCopy.get(path.join(targetDir, "file.js"))).toBe(nftDst);
  });

  test("is a no-op for consumers with no `imports` field", () => {
    const consumerPkg = path.join(
      projectRoot,
      "node_modules/consumer/package.json",
    );
    writeJson(consumerPkg, { name: "consumer" });

    const filesToCopy = new Map<string, string>([
      [
        consumerPkg,
        path.join(fakeOutRoot, "node_modules/consumer/package.json"),
      ],
    ]);
    const snapshot = new Map(filesToCopy);

    augmentWithImportsRemaps(filesToCopy, projectRoot);

    expect(filesToCopy).toEqual(snapshot);
  });
});
