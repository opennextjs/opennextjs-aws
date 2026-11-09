import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

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

  test("minifies JavaScript files", async () => {
    const file = path.join(dir, "index.js");
    await fs.writeFile(
      file,
      "function add(first, second) {\n  // Adds two numbers.\n  return first + second;\n}\nmodule.exports = { add };\n",
    );

    await minifyAll(dir, { mangle: true });

    const output = await fs.readFile(file, "utf8");
    expect(output).not.toContain("Adds two numbers");
    expect(output).not.toContain("\n");
    const context = {
      module: { exports: {} as { add: (a: number, b: number) => number } },
    };
    vm.runInNewContext(output, context);
    expect(context.module.exports.add(1, 2)).toBe(3);
  });

  test("compresses JSON files when compress_json is set", async () => {
    const file = path.join(dir, "data.json");
    await fs.writeFile(file, '{\n  "name": "app"\n}\n');

    await minifyAll(dir, { compress_json: true });

    expect(await fs.readFile(file, "utf8")).toBe('{"name":"app"}');
  });

  test("skips empty files without reporting them as failed", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const file = path.join(dir, "empty.js");
    await fs.writeFile(file, "");

    await minifyAll(dir, {});

    expect(await fs.readFile(file, "utf8")).toBe("");
    expect(log).not.toHaveBeenCalled();
  });
});
