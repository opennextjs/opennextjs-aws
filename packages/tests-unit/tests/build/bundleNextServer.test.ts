import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { bundleNextServer } from "@opennextjs/aws/build/bundleNextServer.js";
import { afterEach } from "vitest";

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * Next's compiled `next-server` graph includes a bare `require("sharp")` in
 * `image-optimizer`. Recreate that here so the test does not depend on Next
 * or sharp being present in this workspace.
 */
function createAppWithSharp(): string {
  const appPath = mkdtempSync(
    path.join(tmpdir(), "opennext-bundle-next-server-"),
  );
  write(
    path.join(appPath, "package.json"),
    JSON.stringify({ name: "test-app" }),
  );
  write(
    path.join(appPath, "node_modules/next/package.json"),
    JSON.stringify({ name: "next" }),
  );
  write(
    path.join(appPath, "node_modules/next/dist/esm/server/next-server.js"),
    `let _sharp;
function getSharp() {
  _sharp = require("sharp");
  return _sharp;
}
export default class NextServer {
  constructor() {
    this.getSharp = getSharp;
  }
}
`,
  );
  write(
    path.join(appPath, "node_modules/sharp/package.json"),
    JSON.stringify({ name: "sharp", main: "lib/index.js" }),
  );
  write(
    path.join(appPath, "node_modules/sharp/lib/index.js"),
    `module.exports = require("../build/sharp-linux-x64.node");
`,
  );
  write(
    path.join(appPath, "node_modules/sharp/build/sharp-linux-x64.node"),
    "native-binary-placeholder",
  );
  return appPath;
}

describe("bundleNextServer", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not bundle sharp native binaries when sharp is resolvable", async () => {
    const appPath = createAppWithSharp();
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "opennext-bundle-next-server-out-"),
    );
    dirs.push(appPath, outputDir);

    await bundleNextServer(outputDir, appPath, { minify: false });

    const bundled = readFileSync(
      path.join(outputDir, "next-server.runtime.prod.js"),
      "utf8",
    );
    expect(bundled).toMatch(/require\(["']sharp["']\)/);
    expect(bundled).not.toContain("native-binary-placeholder");
  });
});
