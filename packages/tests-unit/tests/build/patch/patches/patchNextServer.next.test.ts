/**
 * Runs the patches against the real files of the Next.js version installed in the examples.
 *
 * The other tests use frozen snippets, they keep passing when Next changes its code and
 * the rules silently stop matching. The e2e workflow runs this test after installing the
 * latest version of Next in the examples.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyRule,
  parseCode,
  patchCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { isVersionInRange } from "@opennextjs/aws/build/patch/codePatcher.js";
import {
  exposeRevalidateRule,
  patchNextServer,
} from "@opennextjs/aws/build/patch/patches/patchNextServer.js";
import { describe, it } from "vitest";
import { getInstalledNextPackages } from "./util.js";

describe.each(
  getInstalledNextPackages().filter(({ version }) =>
    isVersionInRange(version, ">=15.4.0"),
  ),
)("patchNextServer on next@$version", (next) => {
  const filePath = path.join(next.dir, "dist/server/next-server.js");
  const code = readFileSync(filePath, "utf8");

  describe("exposeRevalidateRule", () => {
    it("should be selected by the patch", () => {
      const patch = patchNextServer.patches.find(({ contentFilter }) =>
        contentFilter?.source.includes("render404"),
      );
      expect(patch).toBeDefined();
      expect(filePath).toMatch(patch!.pathFilter);
      expect(patch!.contentFilter?.test(code)).toBe(true);
    });

    it("should expose revalidate in the router server context exactly once", () => {
      expect(
        applyRule(exposeRevalidateRule, parseCode(code)).matches,
      ).toHaveLength(1);
      const patched = patchCode(code, exposeRevalidateRule);
      expect(patched).toMatch(
        /render404: this\.render404\.bind\(this\),\s*revalidate: this\.revalidate\.bind\(this\)/,
      );
      expect(
        applyRule(exposeRevalidateRule, parseCode(patched)).matches,
      ).toHaveLength(0);
    });

    it("should expose a revalidate method", () => {
      expect(code).toMatch(
        /async revalidate\(\{ urlPath, (headers|revalidateHeaders), opts \}\)/,
      );
    });
  });
});
