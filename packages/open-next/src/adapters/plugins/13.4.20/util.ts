import path from "node:path";

import { loadConfig } from "../../util.js";

const NEXT_DIR = path.join(__dirname, ".next");

const config = loadConfig(NEXT_DIR);
//#override requestHandler

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify({
  ...config,
  // Next.js compression should be disabled because of a bug in the bundled
  // `compression` package — https://github.com/vercel/next.js/issues/11669
  compress: false,
  // By default, Next.js uses local disk to store ISR cache. We will use
  // our own cache handler to store the cache on S3.
  skipMiddlewareUrlNormalize: true,
  experimental: {
    ...config.experimental,
    // This uses the request.headers.host as the URL
    // https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next-server.ts#L1749-L1754
    trustHostHeader: true,
    incrementalCacheHandlerPath: `${process.env.LAMBDA_TASK_ROOT}/cache.cjs`,
  },
});
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = true
  ? config.experimental && config.experimental.serverActions
    ? "experimental"
    : "next"
  : "";

require("next");
const { getRequestHandlers } = require("next/dist/server/lib/start-server");

const handlers = await getRequestHandlers({
  customServer: false,
  dev: false,
  dir: __dirname,
});
export const requestHandler = handlers[0];
//#endOverride
