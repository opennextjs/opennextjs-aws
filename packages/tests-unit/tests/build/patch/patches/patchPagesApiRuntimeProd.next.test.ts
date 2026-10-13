/**
 * Runs the patch against the real files of the Next.js version installed in the examples.
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
import {
  headFetchProtocolRule,
  patchPagesApiRuntimeProd,
  trustHostHeaderRule,
} from "@opennextjs/aws/build/patch/patches/patchPagesApiRuntimeProd.js";
import { describe, it } from "vitest";
import { getInstalledNextPackages } from "./util.js";

describe.each(getInstalledNextPackages(["pages-router", "app-pages-router"]))(
  "patchPagesApiRuntimeProd on next@$version",
  (next) => {
    const files = ["pages-api", "pages-api-turbo"].map((name) =>
      path.join(next.dir, `dist/compiled/next-server/${name}.runtime.prod.js`),
    );

    describe.each(files)("%s", (filePath) => {
      const code = readFileSync(filePath, "utf8");

      it("should be selected by every patch", () => {
        for (const patch of patchPagesApiRuntimeProd.patches) {
          expect(filePath).toMatch(patch.pathFilter);
          expect(patch.contentFilter?.test(code)).toBe(true);
        }
      });

      it("should apply every rule exactly once", () => {
        for (const rule of [trustHostHeaderRule, headFetchProtocolRule]) {
          expect(applyRule(rule, parseCode(code)).matches).toHaveLength(1);
        }
      });

      it("should revalidate with the host and protocol of the request", () => {
        const patched = patchCode(
          patchCode(code, trustHostHeaderRule),
          headFetchProtocolRule,
        );
        // `trustHostHeader` is forced on the context that every check reads
        const [, context] =
          patched.match(/(\w+)\.trustHostHeader = true;/) ?? [];
        expect(context).toBeDefined();
        expect(patched.match(/\w+\.trustHostHeader = true;/g)).toHaveLength(1);
        expect(patched).toContain(`if(${context}.trustHostHeader){`);
        expect(patched).toMatch(
          /await fetch\(`\$\{(\w+)\.headers\["x-forwarded-proto"\] \|\| "https"\}:\/\/\$\{\1\.headers\.host\}\$\{\w+\}`,\{method:"HEAD"/,
        );
        expect(
          applyRule(headFetchProtocolRule, parseCode(patched)).matches,
        ).toHaveLength(0);
      });
    });
  },
);
