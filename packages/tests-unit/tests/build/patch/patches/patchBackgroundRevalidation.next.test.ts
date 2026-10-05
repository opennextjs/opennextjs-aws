/**
 * Runs the patch against the real files of the Next.js version installed in the examples.
 *
 * The other tests use frozen snippets, they keep passing when Next changes its code and
 * the rule silently stops matching. The e2e workflow runs this test after installing the
 * latest version of Next in the examples.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";

import {
  applyRule,
  parseCode,
  patchCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  patchBackgroundRevalidation,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchBackgroundRevalidation.js";
import { describe, it, vi } from "vitest";
import { getInstalledNextPackages } from "./util.js";

describe.each(getInstalledNextPackages())(
  "patchBackgroundRevalidation on next@$version",
  (next) => {
    const runtimeDir = path.join(next.dir, "dist/compiled/next-server");
    // Discover files independently of the patch filters. A broken filter must
    // fail, not silently remove a turbo/experimental runtime from this suite.
    const files = [
      path.join(next.dir, "dist/server/response-cache/index.js"),
      ...readdirSync(runtimeDir)
        .filter((name) =>
          /^(app-page|app-route|pages|pages-api)(?:-[\w-]+)?\.runtime\.prod\.js$/.test(
            name,
          ),
        )
        .map((name) => path.join(runtimeDir, name)),
    ];

    it("discovers both bundlers' route runtimes", () => {
      expect(files.map((file) => path.basename(file))).toEqual(
        expect.arrayContaining([
          "app-page.runtime.prod.js",
          "app-page-turbo.runtime.prod.js",
          "app-route.runtime.prod.js",
          "app-route-turbo.runtime.prod.js",
          "pages.runtime.prod.js",
          "pages-turbo.runtime.prod.js",
          "pages-api.runtime.prod.js",
          "pages-api-turbo.runtime.prod.js",
        ]),
      );
    });

    it.each(files)("should patch %s exactly once", (filePath) => {
      const code = readFileSync(filePath, "utf8");
      const patch = patchBackgroundRevalidation.patches[0];
      expect(filePath).toMatch(patch.pathFilter);
      expect(patch.contentFilter?.test(code), filePath).toBe(true);
      const { matches } = applyRule(rule, parseCode(code));
      expect(matches).toHaveLength(1);
      expect(
        applyRule(rule, parseCode(patchCode(code, rule))).matches,
      ).toHaveLength(0);
    });

    it.each([
      { name: "fresh", stale: false, regenerate: false },
      { name: "stale", stale: true, regenerate: false },
      {
        name: "stale prefetch",
        stale: true,
        prefetch: true,
        regenerate: false,
      },
      { name: "on-demand", stale: true, onDemand: true, regenerate: true },
      { name: "expired", stale: -1, regenerate: true },
      { name: "miss", miss: true, regenerate: true },
      { name: "prefetch miss", miss: true, prefetch: true, regenerate: true },
    ])(
      "preserves $name behavior in the installed handleGet",
      async (testCase) => {
        const require = createRequire(path.join(next.dir, "package.json"));
        const ResponseCache =
          require("./dist/server/response-cache/index.js").default;
        const source = `class Cache { ${ResponseCache.prototype.handleGet.toString()} }`;
        expect(applyRule(rule, parseCode(source)).matches).toHaveLength(1);
        const Patched = runInNewContext(`(${patchCode(source, rule)})`);
        const cache = new Patched();
        cache.getCacheContext = () => ({});
        const regenerated = { value: "new" };
        cache.revalidate = cache.handleRevalidate = vi.fn(
          async () => regenerated,
        );
        const entry = testCase.miss
          ? null
          : { isStale: testCase.stale, value: "old" };
        const resolve = vi.fn();
        const result = await cache.handleGet(
          "key",
          vi.fn(),
          {
            incrementalCache: { get: async () => entry },
            isOnDemandRevalidate: testCase.onDemand,
            isPrefetch: testCase.prefetch,
          },
          resolve,
        );
        expect(result).toBe(testCase.regenerate ? regenerated : entry);
        expect(cache.revalidate).toHaveBeenCalledTimes(
          testCase.regenerate ? 1 : 0,
        );
        expect(resolve).toHaveBeenCalledTimes(testCase.regenerate ? 0 : 1);
      },
    );
  },
);
