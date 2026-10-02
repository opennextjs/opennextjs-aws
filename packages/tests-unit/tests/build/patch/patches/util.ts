import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  type CodePatcher,
  isVersionInRange,
} from "@opennextjs/aws/build/patch/codePatcher.js";
import { createPatch } from "diff";

/**
 * Compute the diff resulting of applying the `rule` to `src`.
 *
 * @param filename Filename used in the patch output
 * @param src Content of the source code
 * @param rule ASTgrep rule
 * @returns diff in unified diff format
 */
export function computePatchDiff(
  filename: string,
  src: string,
  rule: string,
): string {
  const dst = patchCode(src, rule);
  return createPatch(filename, src, dst);
}

const examplesDir = fileURLToPath(
  new URL("../../../../../../examples", import.meta.url),
);

/**
 * Get the Next.js packages installed in the examples.
 *
 * The e2e workflow installs the latest version of Next in these examples.
 *
 * @param examples Name of the examples
 * @returns the deduplicated path and version of the Next.js packages
 */
export function getInstalledNextPackages(
  examples = ["app-router", "pages-router", "app-pages-router"],
): { dir: string; version: string }[] {
  const dirs = examples.map((example) => {
    const require = createRequire(
      path.join(examplesDir, example, "package.json"),
    );
    return path.dirname(require.resolve("next/package.json"));
  });
  return [...new Set(dirs)].map((dir) => ({
    dir,
    version: JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"))
      .version,
  }));
}

/**
 * Get the files of a Next.js package that a code patcher applies to.
 *
 * It selects the files the same way `applyCodePatches` does at build time,
 * i.e. using the `versions`, the `pathFilter` and the `contentFilter` of the patches.
 *
 * @param next A Next.js package, see `getInstalledNextPackages`
 * @param codePatcher The code patcher
 * @returns the files (path relative to the package) with their content and the patches to apply
 */
export function getNextFilesToPatch(
  next: { dir: string; version: string },
  codePatcher: CodePatcher,
): { name: string; code: string; patches: CodePatcher["patches"] }[] {
  const patches = codePatcher.patches.filter(({ versions }) =>
    isVersionInRange(next.version, versions),
  );
  return (readdirSync(next.dir, { recursive: true }) as string[]).flatMap(
    (name) => {
      const filePath = path.join(next.dir, name);
      const matchingPath = patches.filter(({ pathFilter }) =>
        filePath.match(pathFilter),
      );
      if (matchingPath.length === 0) {
        return [];
      }
      const code = readFileSync(filePath, "utf-8");
      const matchingContent = matchingPath.filter(
        ({ contentFilter }) => !contentFilter || code.match(contentFilter),
      );
      return matchingContent.length === 0
        ? []
        : [{ name, code, patches: matchingContent }];
    },
  );
}
