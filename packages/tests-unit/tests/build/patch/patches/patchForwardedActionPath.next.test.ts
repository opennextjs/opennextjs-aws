/**
 * Runs the patch against the real files of the Next.js version installed in the examples.
 *
 * The other tests use frozen snippets, they keep passing when Next changes its code and
 * the rule silently stops matching. The e2e workflow runs this test after installing the
 * latest version of Next in the examples.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  applyRule,
  parseCode,
  patchCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  dynamicSegmentsReplacement,
  patchForwardedActionPath,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchForwardedActionPath.js";
import { describe, expect, it } from "vitest";
import { getInstalledNextPackages } from "./util.js";

describe.each(getInstalledNextPackages())(
  "patchForwardedActionPath on next@$version",
  (next) => {
    const runtimeDir = path.join(next.dir, "dist/compiled/next-server");
    // Discover files independently of the patch filters. A broken filter must
    // fail, not silently remove a runtime from this suite.
    const files = [
      path.join(next.dir, "dist/server/app-render/action-handler.js"),
      ...readdirSync(runtimeDir)
        .filter((name) =>
          /^app-page(?:-[\w-]+)?\.runtime\.prod\.js$/.test(name),
        )
        .map((name) => path.join(runtimeDir, name)),
    ];

    it("discovers both bundlers' page runtimes", () => {
      expect(files.map((file) => path.basename(file))).toEqual(
        expect.arrayContaining([
          "action-handler.js",
          "app-page.runtime.prod.js",
          "app-page-turbo.runtime.prod.js",
        ]),
      );
    });

    it.each(files)("should patch %s exactly once", (filePath) => {
      const code = readFileSync(filePath, "utf8");
      const patch = patchForwardedActionPath.patches[0];
      expect(filePath).toMatch(patch.pathFilter);
      expect(patch.contentFilter?.test(code), filePath).toBe(true);
      const { matches } = applyRule(rule, parseCode(code));
      expect(matches).toHaveLength(1);
      // Only the path is rewritten, the rest of the file is kept as it is.
      const patched = patchCode(code, rule);
      const [start, end] = patched.split(dynamicSegmentsReplacement);
      expect(`${start}${end}`).toBe(code);
      // The patched code must not match again.
      expect(applyRule(rule, parseCode(patched)).matches).toHaveLength(0);
    });
  },
);
