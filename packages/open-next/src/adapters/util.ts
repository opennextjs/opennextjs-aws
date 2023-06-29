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
  // Static routes take precedence over dynamic routes
  return [...routesManifest.staticRoutes, ...routesManifest.dynamicRoutes];
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
    // Fix route interception

    // Remove (.) as it's not useful for us here
    let cleanedKey = key.replace(/\(\.\)/g, "");

    const cleanInterceptingSegment = (_key: string, double: boolean) => {
      const toRemoveSegment: number[] = [];
      _key.split("/").forEach((segment, index) => {
        if (segment.includes(double ? "(..)(..)" : "(..)")) {
          if (index - 1 >= 0) {
            toRemoveSegment.push(index - 1);
          }
          if (double && index - 2 >= 0) {
            toRemoveSegment.push(index - 2);
          }
        }
      });
      return _key
        .split("/")
        .filter((_, index) => !toRemoveSegment.includes(index))
        .join("/")
        .replace(/\(\.\.\)/g, "");
    };

    // Fix (..)(..) to match segment two levels above
    if (cleanedKey.includes("(..)(..)")) {
      cleanedKey = cleanInterceptingSegment(cleanedKey, true);
    }

    // Fix (..) to match segment one level above
    if (cleanedKey.includes("(..)")) {
      cleanedKey = cleanInterceptingSegment(cleanedKey, false);
    }

    // Fix (...) to match segments from the root app directory
    // Once we encounter (...) we can remove the beginning of the key
    if (cleanedKey.includes("(...)")) {
      cleanedKey = cleanedKey.slice(cleanedKey.indexOf("(...)"));
      cleanedKey = cleanedKey.replace(/\(\.\.\.\)/, "");
    }

    // Remove group and parallel route params and /page suffix
    cleanedKey = cleanedKey.replace(/\/\([^)]*\)|\/page$|\/@[^\/]+/g, "");
    // We need to check if the cleaned key is empty because it means it's the root path
    return cleanedKey === "" ? "/" : cleanedKey;
  });
}
