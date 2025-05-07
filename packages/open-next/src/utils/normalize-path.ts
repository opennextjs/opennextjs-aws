import path from "node:path";

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

export function getOutputDir() {
  return path.join(
    globalThis.monorepoPackagePath
      .split("/")
      .filter(Boolean)
      .map(() => "..")
      .join("/"),
  );
}
