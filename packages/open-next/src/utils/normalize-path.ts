import path from "node:path";

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

// See: https://github.com/vercel/next.js/blob/3ecf087f10fdfba4426daa02b459387bc9c3c54f/packages/next/src/shared/lib/utils.ts#L348
export function normalizeRepeatedSlashes(url: URL) {
  const urlNoQuery = url.host + url.pathname;
  return `${url.protocol}//${urlNoQuery
    .replace(/\\/g, "/")
    .replace(/\/\/+/g, "/")}${url.search}`;
}

export function getMonorepoRelativePath(relativePath = "../.."): string {
  return path.join(
    globalThis.monorepoPackagePath
      .split("/")
      .filter(Boolean)
      .map(() => "..")
      .join("/"),
    relativePath,
  );
}
