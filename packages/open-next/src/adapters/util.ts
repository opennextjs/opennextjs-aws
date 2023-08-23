import fs from "node:fs";
import path from "node:path";

import type { PublicFiles } from "../build.js";
import type { NextConfig, RoutesManifest } from "./next-types.js";

export function setNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export function loadConfig(nextDir: string) {
  const filePath = path.join(nextDir, "required-server-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const { config } = JSON.parse(json);
  return config as NextConfig;
}
export function loadBuildId(nextDir: string) {
  const filePath = path.join(nextDir, "BUILD_ID");
  return fs.readFileSync(filePath, "utf-8").trim();
}

export function loadHtmlPages(nextDir: string) {
  const filePath = path.join(nextDir, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([key]) => key);
}

export function loadPublicAssets(openNextDir: string) {
  const filePath = path.join(openNextDir, "public-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PublicFiles;
}

export function loadRoutesManifest(nextDir: string) {
  const filePath = path.join(nextDir, "routes-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const routesManifest = JSON.parse(json) as RoutesManifest;

  const _dataRoutes = routesManifest.dataRoutes ?? [];
  const dataRoutes = {
    static: _dataRoutes.filter((r) => r.routeKeys === undefined),
    dynamic: _dataRoutes.filter((r) => r.routeKeys !== undefined),
  };

  return {
    rewrites: {
      beforeFiles: routesManifest.rewrites.beforeFiles ?? [],
      afterFiles: routesManifest.rewrites.afterFiles ?? [],
      fallback: routesManifest.rewrites.fallback ?? [],
    },
    redirects: routesManifest.redirects ?? [],
    routes: {
      static: routesManifest.staticRoutes ?? [],
      dynamic: routesManifest.dynamicRoutes ?? [],
      data: dataRoutes,
    },
  };
}

export function loadConfigHeaders(nextDir: string) {
  const filePath = path.join(nextDir, "routes-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const routesManifest = JSON.parse(json) as RoutesManifest;
  return routesManifest.headers;
}

export function loadAppPathsManifestKeys(nextDir: string) {
  const appPathsManifestPath = path.join(
    nextDir,
    "server",
    "app-paths-manifest.json",
  );
  const appPathsManifestJson = fs.existsSync(appPathsManifestPath)
    ? fs.readFileSync(appPathsManifestPath, "utf-8")
    : "{}";
  const appPathsManifest = JSON.parse(appPathsManifestJson) as Record<
    string,
    string
  >;
  return Object.keys(appPathsManifest).map((key) => {
    // Remove parallel route
    let cleanedKey = key.replace(/\/@[^\/]+/g, "");

    // Remove group routes
    cleanedKey = cleanedKey.replace(/\/\((?!\.)[^\)]*\)/g, "");

    // Remove /page suffix
    cleanedKey = cleanedKey.replace(/\/page$/g, "");
    // We need to check if the cleaned key is empty because it means it's the root path
    return cleanedKey === "" ? "/" : cleanedKey;
  });
}

export function escapeRegex(str: string) {
  let path = str.replace(/\(\.\)/g, "_µ1_");

  path = path.replace(/\(\.{2}\)/g, "_µ2_");

  path = path.replace(/\(\.{3}\)/g, "_µ3_");

  return path;
}

export function unescapeRegex(str: string) {
  let path = str.replace(/_µ1_/g, "(.)");

  path = path.replace(/_µ2_/g, "(..)");

  path = path.replace(/_µ3_/g, "(...)");

  return path;
}
