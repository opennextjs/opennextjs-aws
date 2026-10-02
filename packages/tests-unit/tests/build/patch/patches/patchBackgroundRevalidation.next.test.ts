/**
 * Runs the patch against the real files of the Next.js version installed in the examples.
 *
 * The other tests use frozen snippets, they keep passing when Next changes its code and
 * the rule silently stops matching. The e2e workflow runs this test after installing the
 * latest version of Next in the examples.
 */
import {
  applyRule,
  parseCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  patchBackgroundRevalidation,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchBackgroundRevalidation.js";
import { describe, it } from "vitest";
import { getInstalledNextPackages, getNextFilesToPatch } from "./util.js";

// Every one of these has its own copy of `ResponseCache`
const expectedFiles = [
  /server[/\\]response-cache[/\\]index\.js$/,
  /app-page\.runtime\.prod\.js$/,
  /app-route\.runtime\.prod\.js$/,
  /pages\.runtime\.prod\.js$/,
];

describe.each(getInstalledNextPackages())(
  "patchBackgroundRevalidation on next@$version",
  (next) => {
    const files = getNextFilesToPatch(next, patchBackgroundRevalidation);

    it.each(expectedFiles)("should apply to %s", (expectedFile) => {
      expect(files.some(({ name }) => expectedFile.test(name))).toBe(true);
    });

    it.each(files)("should patch $name exactly once", ({ code }) => {
      const { matches } = applyRule(rule, parseCode(code));
      expect(matches).toHaveLength(1);
    });
  },
);
