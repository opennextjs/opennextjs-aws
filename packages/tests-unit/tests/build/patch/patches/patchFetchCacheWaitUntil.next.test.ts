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
  patchFetchCacheSetMissingWaitUntil,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchFetchCacheWaitUntil.js";
import { describe, expect, it } from "vitest";
import { getInstalledNextPackages } from "./util.js";

describe.each(getInstalledNextPackages())(
  "patchFetchCacheSetMissingWaitUntil on next@$version",
  (next) => {
    const runtimeDir = path.join(next.dir, "dist/compiled/next-server");
    // Discover files independently of the patch filters. A broken filter must
    // fail, not silently remove a runtime from this suite.
    const files = [
      path.join(next.dir, "dist/server/lib/patch-fetch.js"),
      ...readdirSync(runtimeDir)
        .filter((name) =>
          /^app-route(?:-[\w-]+)?\.runtime\.prod\.js$/.test(name),
        )
        .map((name) => path.join(runtimeDir, name)),
    ];

    it("discovers both bundlers' route runtimes", () => {
      expect(files.map((file) => path.basename(file))).toEqual(
        expect.arrayContaining([
          "patch-fetch.js",
          "app-route.runtime.prod.js",
          "app-route-turbo.runtime.prod.js",
        ]),
      );
    });

    it.each(files)("should patch %s exactly once", (filePath) => {
      const code = readFileSync(filePath, "utf8");
      const patch = patchFetchCacheSetMissingWaitUntil.patches[0];
      expect(filePath).toMatch(patch.pathFilter);
      expect(patch.contentFilter?.test(code), filePath).toBe(true);
      expect(applyRule(rule, parseCode(code)).matches).toHaveLength(1);
      // The patched code must not match again.
      expect(
        applyRule(rule, parseCode(patchCode(code, rule))).matches,
      ).toHaveLength(0);
    });
  },
);
