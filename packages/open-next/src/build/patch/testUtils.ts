/**
 * Utilities to test code patches.
 *
 * They are used by the OpenNext adapters to test their patches against frozen snippets and against
 * the files of the Next.js versions they are installed with.
 * This module is not used at build time or at runtime.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { patchCode } from "./astCodePatcher.js";
import { type CodePatcher, isVersionInRange } from "./codePatcher.js";

const require = createRequire(import.meta.url);

/**
 * A Next.js package installed on disk.
 */
export interface NextPackage {
  /** Directory of the package, i.e. the directory of its `package.json`. */
  dir: string;
  /** Version of the package. */
  version: string;
}

/**
 * Compute the diff resulting of applying the `rule` to `src`.
 *
 * `diff` is an optional peer dependency of `@opennextjs/aws`: it must be installed to call this function.
 *
 * @param filename Filename used in the patch output
 * @param src Content of the source code
 * @param rule ASTgrep rule
 * @returns diff in unified diff format
 * @throws When the `diff` package is not installed
 */
export function computePatchDiff(
  filename: string,
  src: string,
  rule: string,
): string {
  // Loaded lazily so that the other utilities can be used without `diff`.
  const { createPatch } = require("diff") as typeof import("diff");
  const dst = patchCode(src, rule);
  return createPatch(filename, src, dst);
}

/**
 * Get the Next.js packages installed for some applications.
 *
 * Packages are deduplicated by version: a package manager can install the same version in multiple
 * directories (i.e. pnpm when the peer dependencies differ).
 *
 * @param appDirs Directories of the applications (absolute or relative to the current working directory),
 *                `next` is resolved from their `package.json`
 * @returns the path and version of the Next.js packages
 * @throws When `next` can not be resolved from one of the applications
 */
export function getInstalledNextPackages(appDirs: string[]): NextPackage[] {
  const packages = new Map<string, string>();
  for (const appDir of appDirs) {
    const appRequire = createRequire(
      path.join(path.resolve(appDir), "package.json"),
    );
    const dir = path.dirname(appRequire.resolve("next/package.json"));
    const { version } = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf-8"),
    );
    if (!packages.has(version)) {
      packages.set(version, dir);
    }
  }
  return [...packages].map(([version, dir]) => ({ dir, version }));
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
  next: NextPackage,
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
