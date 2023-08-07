import fs from "node:fs";
import path from "node:path";

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
export const config = loadConfig(NEXT_DIR);
import {
  overrideHooks as overrideNextjsRequireHooks,
  applyOverride as applyNextjsRequireHooksOverride,
} from "./require-hooks.js";

import type { NextConfig, RoutesManifest, MiddlewareManifest } from "./next-types.js";
import type { PublicFiles } from "../build.js";

// WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react
// Step 1: Need to override the require hooks for React before Next.js server
//         overrides them with prebundled ones in the case of app dir
// Step 2: Import Next.js server
// Step 3: Apply the override after Next.js server is imported since the
//         override that Next.js does is done at import time
overrideNextjsRequireHooks(config);
// @ts-ignore
import NextServer from "next/dist/server/next-server.js";
applyNextjsRequireHooksOverride();

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
export function loadMiddlewareManifest(nextDir: string) {
  const filePath = path.join(nextDir, "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as MiddlewareManifest;
}

export function loadRoutesManifest(nextDir: string) {
  const filePath = path.join(nextDir, "routes-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const routesManifest = JSON.parse(json) as RoutesManifest;
  // Static routes take precedence over dynamic routes
  return [...routesManifest.staticRoutes, ...routesManifest.dynamicRoutes];
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
  const appPathsManifest = JSON.parse(appPathsManifestJson) as Record<string, string>;
  return Object.keys(appPathsManifest).map((key) => {
    // Remove group route params and /page suffix
    const cleanedKey = key.replace(/\/\(\w+\)|\/page$/g, "");
    // We need to check if the cleaned key is empty because it means it's the root path
    return cleanedKey === "" ? "/" : cleanedKey;
  });
}

export function getMiddlewareMatch(middlewareManifest: MiddlewareManifest) {
  return middlewareManifest.middleware["/"].matchers.map(({ regexp }) => new RegExp(regexp));
}

let _requestHandler: any;
export function createRequestHandler() {
  if (!_requestHandler) {
    _requestHandler = new NextServer.default({
      hostname: "localhost",
      port: 3000,
      conf: {
        ...config,
        // Next.js compression should be disabled because of a bug in the bundled
        // `compression` package — https://github.com/vercel/next.js/issues/11669
        compress: false,
        // By default, Next.js uses local disk to store ISR cache. We will use
        // our own cache handler to store the cache on S3.
        experimental: {
          ...config.experimental,
          incrementalCacheHandlerPath: `${process.env.LAMBDA_TASK_ROOT}/cache.cjs`,
        },
      },
      customServer: false,
      dev: false,
      dir: __dirname,
    }).getRequestHandler();
  }
  return _requestHandler;
}
