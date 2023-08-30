import fs from "node:fs";
import path from "node:path";

// @ts-ignore
import NextServer from "next/dist/server/next-server.js";

import { InternalEvent } from "../event-mapper.js";
import { debug } from "../logger.js";
import { MiddlewareManifest } from "../next-types.js";
import {
  applyOverride as applyNextjsRequireHooksOverride,
  overrideHooks as overrideNextjsRequireHooks,
} from "../require-hooks.js";
import {
  loadAppPathsManifestKeys,
  loadConfig,
  loadRoutesManifest,
} from "../util.js";

const NEXT_DIR = path.join(__dirname, ".next");

const routesManifest = loadRoutesManifest(NEXT_DIR);
const appPathsManifestKeys = loadAppPathsManifestKeys(NEXT_DIR);

const config = loadConfig(NEXT_DIR);

// WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react
// Step 1: Need to override the require hooks for React before Next.js server
//         overrides them with prebundled ones in the case of app dir
// Step 2: Import Next.js server
// Step 3: Apply the override after Next.js server is imported since the
//         override that Next.js does is done at import time

overrideNextjsRequireHooks(config);
applyNextjsRequireHooksOverride();

//#override requestHandler
// @ts-ignore
export const requestHandler = new NextServer.default({
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
//#endOverride

export function getMiddlewareMatch(middlewareManifest: MiddlewareManifest) {
  const rootMiddleware = middlewareManifest.middleware["/"];
  if (!rootMiddleware?.matchers) return [];
  return rootMiddleware.matchers.map(({ regexp }) => new RegExp(regexp));
}

export function loadMiddlewareManifest(nextDir: string) {
  const filePath = path.join(nextDir, "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as MiddlewareManifest;
}

export function setNextjsPrebundledReact(rawPath: string) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react

  const route = routesManifest.find((route) =>
    new RegExp(route.regex).test(rawPath ?? ""),
  );

  const isApp = appPathsManifestKeys.includes(route?.page ?? "");
  debug("setNextjsPrebundledReact", { url: rawPath, isApp, route });

  // app routes => use prebundled React
  if (isApp) {
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = config.experimental
      .serverActions
      ? "experimental"
      : "next";
    return;
  }

  // page routes => use node_modules React
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = undefined;
}

export function fixDataPage(internalEvent: InternalEvent, buildId: string) {
  const { rawPath, query } = internalEvent;
  const dataPattern = `/_next/data/${buildId}`;

  if (rawPath.startsWith(dataPattern) && rawPath.endsWith(".json")) {
    const newPath = rawPath.replace(dataPattern, "").replace(/\.json$/, "");
    query.__nextDataReq = "1";
    const urlQuery: Record<string, string> = {};
    Object.keys(query).forEach((k) => {
      const v = query[k];
      urlQuery[k] = Array.isArray(v) ? v.join(",") : v;
    });
    return {
      ...internalEvent,
      rawPath: newPath,
      query,
      url: `${newPath}${
        query ? `?${new URLSearchParams(urlQuery).toString()}` : ""
      }`,
    };
  }
  return internalEvent;
}
