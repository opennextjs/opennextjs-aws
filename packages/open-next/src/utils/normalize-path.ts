import path from "node:path";

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

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
