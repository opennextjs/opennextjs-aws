import { NextConfig } from "../../config";
import { debug } from "../../logger.js";

//#override requestHandler
// @ts-ignore
export const requestHandler = new NextServer.default({
  conf: {
    ...NextConfig,
    // Next.js compression should be disabled because of a bug in the bundled
    // `compression` package — https://github.com/vercel/next.js/issues/11669
    compress: false,
    // By default, Next.js uses local disk to store ISR cache. We will use
    // our own cache handler to store the cache on S3.
    cacheHandler: `${process.env.LAMBDA_TASK_ROOT}/cache.cjs`,
    experimental: {
      ...NextConfig.experimental,
      // This uses the request.headers.host as the URL
      // https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next-server.ts#L1749-L1754
      trustHostHeader: true,
    },
  },
  customServer: false,
  dev: false,
  dir: __dirname,
}).getRequestHandler();
//#endOverride

//#override requireHooks
debug("No need to override require hooks with next 13.4.20+");
//#endOverride