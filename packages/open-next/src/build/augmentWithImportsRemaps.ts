/**
 * Workaround for Next.js NFT tracing missing `package.json#imports` remap targets.
 *
 * Next's NFT tracer does not follow the `imports` field, so packages only
 * reachable via a subpath remap (e.g. `@mathjax/src`'s `"#mhchem/*"` ->
 * `"mhchemparser/esm/*"`) are missing from the trace and the runtime fails
 * to resolve them.
 *
 * This file augments the traced file set by walking each traced
 * `package.json` and following its `imports` remaps to source.
 *
 * Tracking issue: https://github.com/vercel/next.js/issues/93295
 */

import { type Dirent, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { getCrossPlatformPathRegex } from "utils/regex.js";

export const packageJsonPathRegex = getCrossPlatformPathRegex(
  String.raw`/package\.json$`,
  { escape: false },
);

/**
 * Recursively flatten the value side of a `package.json#imports` entry into
 * a list of remap targets.
 *
 * Values can be a string, a conditional-exports object, or an array of either.
 *
 * @param value - The raw value from a single `imports` entry.
 * @param out - Array that the leaf string targets are appended to (mutated in place).
 */
function collectImportTargets(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectImportTargets(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectImportTargets(v, out));
  }
}

/**
 * Resolve a package's directory using a require instance.
 *
 * @param name - Bare package specifier to resolve (e.g. `"foo"` or `"@scope/foo"`).
 * @param require_ - `NodeRequire` rooted at the location to resolve from.
 * @returns The package's directory, or `null` when `name` is empty or not resolvable.
 */
function resolveConsumerDir(
  name: string,
  require_: NodeRequire,
): string | null {
  if (!name) return null;
  try {
    return path.dirname(require_.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

/**
 * Recursively register every file in a source directory as candidates to copy
 * to a target directory, skipping nested `node_modules` and files tracked via
 * NFT manifests.
 *
 * Discovered `package.json` files are tracked so that `imports` can be resolved.
 *
 * @param targetSrcDir - Source directory to walk.
 * @param targetDstDir - Destination directory for source files to be copied to.
 * @param filesToCopy - Source-to-destination map; mutated with newly-found files.
 * Existing entries are preserved (never overwritten).
 * @param pending - Queue of `[src, dst]` `package.json` pairs to revisit so the
 * caller can follow transitive `imports` remaps; mutated.
 */
function walkTargetPackage(
  targetSrcDir: string,
  targetDstDir: string,
  filesToCopy: Map<string, string>,
  pending: Array<[string, string]>,
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(targetSrcDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const srcEntry = path.join(targetSrcDir, entry.name);
    const dstEntry = path.join(targetDstDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walkTargetPackage(srcEntry, dstEntry, filesToCopy, pending);
    } else if (entry.isFile()) {
      if (filesToCopy.has(srcEntry)) continue;
      filesToCopy.set(srcEntry, dstEntry);
      if (packageJsonPathRegex.test(srcEntry))
        pending.push([srcEntry, dstEntry]);
    }
  }
}

/**
 * Augment `filesToCopy` with targets of `package.json#imports` subpath remaps.
 *
 * Workaround for https://github.com/vercel/next.js/issues/93295: Next's NFT
 * tracer does not follow the `imports` field, so packages that are only
 * reachable via a remap (e.g. `@mathjax/src`'s `"#mhchem/*"` ->
 * `"mhchemparser/esm/*"`) are missing from the trace and the runtime fails
 * to resolve them.
 *
 * For every traced `package.json` with an `imports` field, this scans the
 * remap values for bare-specifier targets, resolves each target package
 * from the consumer's real location, and walks its source files into
 * `filesToCopy`. Newly-discovered `package.json` files are re-queued so
 * transitive remaps are followed. Existing entries in `filesToCopy` are
 * never overwritten.
 *
 * @param filesToCopy - Map from source path to destination path; mutated in place
 * with files of every discovered remap target.
 * @param buildOutputPath - Project root used to seed the resolver for traced
 * consumers.
 */
export function augmentWithImportsRemaps(
  filesToCopy: Map<string, string>,
  buildOutputPath: string,
): void {
  const visitedConsumers = new Set<string>();
  const visitedTargets = new Set<string>();
  const requireCache = new Map<string, NodeRequire>();

  const projectRequire = createRequire(
    path.join(buildOutputPath, "package.json"),
  );

  const pending: Array<[string, string]> = [];
  for (const [src, dst] of filesToCopy) {
    if (packageJsonPathRegex.test(src)) pending.push([src, dst]);
  }

  while (pending.length) {
    const [pkgSrc, pkgDst] = pending.pop()!;
    if (visitedConsumers.has(pkgSrc)) continue;
    visitedConsumers.add(pkgSrc);

    let pkg: { name?: unknown; imports?: unknown };
    try {
      pkg = JSON.parse(readFileSync(pkgSrc, "utf-8"));
    } catch {
      continue;
    }
    if (!pkg.imports || typeof pkg.imports !== "object") continue;

    const consumerName = typeof pkg.name === "string" ? pkg.name : "";
    const consumerSrcDir = path.dirname(pkgSrc);
    const consumerDstDir = path.dirname(pkgDst);
    const dstNodeModules = path.resolve(
      consumerDstDir,
      // traverse up from `node_modules/<name>` or `node_modules/@scope/<name>`
      path.basename(path.dirname(consumerDstDir)).startsWith("@")
        ? "../.."
        : "..",
    );

    // Consumer resolves deps via its own source location in the real project.
    const realConsumerDir =
      resolveConsumerDir(consumerName, projectRequire) ?? consumerSrcDir;
    let consumerRequire = requireCache.get(realConsumerDir);
    if (!consumerRequire) {
      consumerRequire = createRequire(
        path.join(realConsumerDir, "package.json"),
      );
      requireCache.set(realConsumerDir, consumerRequire);
    }

    const targets: string[] = [];
    for (const v of Object.values(pkg.imports)) {
      collectImportTargets(v, targets);
    }

    for (const target of targets) {
      if (
        !target ||
        target.startsWith("./") ||
        target.startsWith("../") ||
        target.startsWith("/") ||
        target.startsWith("#")
      ) {
        continue;
      }

      const parts = target.split("/");

      const isScoped = parts[0].startsWith("@");
      if (isScoped && parts.length < 2) continue;
      const targetPkg = isScoped ? `${parts[0]}/${parts[1]}` : parts[0];
      if (!targetPkg) continue;

      const targetSrcDir = resolveConsumerDir(targetPkg, consumerRequire);
      if (!targetSrcDir || visitedTargets.has(targetSrcDir)) continue;
      visitedTargets.add(targetSrcDir);

      const targetDstDir = path.join(dstNodeModules, targetPkg);
      walkTargetPackage(targetSrcDir, targetDstDir, filesToCopy, pending);
    }
  }
}
