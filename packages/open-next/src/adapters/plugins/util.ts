import fs from "node:fs";
import path from "node:path";
import { config } from "../util.js";
import { MiddlewareManifest } from "../next-types.js";

import {
  overrideHooks as overrideNextjsRequireHooks,
  applyOverride as applyNextjsRequireHooksOverride,
} from "../require-hooks.js";

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

export function getMiddlewareMatch(middlewareManifest: MiddlewareManifest) {
  return middlewareManifest.middleware["/"].matchers.map(({ regexp }) => new RegExp(regexp));
}

export function loadMiddlewareManifest(nextDir: string) {
  const filePath = path.join(nextDir, "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as MiddlewareManifest;
}
