import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { minifyAll } from "@opennextjs/aws/minimize-js.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("minifyAll", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "open-next-minify-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("minifies JavaScript files in place", async () => {
    const file = path.join(dir, "index.js");
    await fs.writeFile(
      file,
      "function add(first, second) {\n  // Adds two numbers.\n  return first + second;\n}\nmodule.exports = { add };\n",
    );

    await minifyAll(dir, { mangle: true });

    const output = await fs.readFile(file, "utf8");
    expect(output).toContain("function add(");
    expect(output).not.toContain("Adds two numbers");
    expect(output).not.toContain("first");
  });

  test("does not report files with an empty output as failed", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await fs.writeFile(path.join(dir, "empty.js"), "");
    await fs.writeFile(path.join(dir, "comment.js"), "// comment\n");

    await minifyAll(dir, {});

    expect(log).not.toHaveBeenCalled();
  });
});
