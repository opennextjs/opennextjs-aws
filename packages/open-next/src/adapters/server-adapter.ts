import path from "node:path";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEvent,
  CloudFrontRequestEvent,
} from "aws-lambda";
import {
  loadAppPathsManifestKeys,
  loadConfig,
  loadHtmlPages,
  loadPublicAssets,
  loadRoutesManifest,
  setNodeEnv,
  loadPrerenderManifest,
  revalidateInBackground,
  generateUniqueId,
} from "./util.js";
import { isBinaryContentType } from "./binary.js";
import { debug } from "./logger.js";
import { convertFrom, convertTo } from "./event-mapper.js";
import {
  overrideHooks as overrideNextjsRequireHooks,
  applyOverride as applyNextjsRequireHooksOverride,
} from "./require-hooks.js";
import type { WarmerEvent, WarmerResponse } from "./warmer-function.js";
import fs from "node:fs";

const NEXT_DIR = path.join(__dirname, ".next");
const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
debug({ NEXT_DIR, OPEN_NEXT_DIR });

setNodeEnv();
setNextjsServerWorkingDirectory();
const config = loadConfig(NEXT_DIR);
const htmlPages = loadHtmlPages(NEXT_DIR);
const routesManifest = loadRoutesManifest(NEXT_DIR);
const appPathsManifestKeys = loadAppPathsManifestKeys(NEXT_DIR);
const publicAssets = loadPublicAssets(OPEN_NEXT_DIR);
const prerenderManifest = loadPrerenderManifest(NEXT_DIR);
// Generate a 6 letter unique server ID
const serverId = `server-${generateUniqueId()}`;

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

const requestHandler = new NextServer.default({
  hostname: "localhost",
  port: Number(process.env.PORT) || 3000,
  // Next.js compression should be disabled because of a bug in the bundled
  // `compression` package — https://github.com/vercel/next.js/issues/11669
  conf: {
    ...config,
    compress: false,
    experimental: {
      ...config.experimental,
      incrementalCacheHandlerPath: `${process.env.LAMBDA_TASK_ROOT}/cache.js`,
    },
  },
  customServer: false,
  dev: false,
  dir: __dirname,
}).getRequestHandler();

/////////////
// Handler //
/////////////

export async function handler(
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent
) {
  debug("event", event);

  // Handler warmer
  if ("type" in event) {
    return formatWarmerResponse(event);
  }

  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event);

  // WORKAROUND: Set `x-forwarded-host` header (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-x-forwarded-host-header-aws-specific
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }

  // WORKAROUND: public/ static files served by the server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-public-static-files-served-by-the-server-function-aws-specific
  if (publicAssets.files.includes(internalEvent.rawPath)) {
    return internalEvent.type === "cf"
      ? formatCloudFrontFailoverResponse(event as CloudFrontRequestEvent)
      : formatAPIGatewayFailoverResponse();
  }

  const reqProps = {
    method: internalEvent.method,
    url: internalEvent.url,
    //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
    // There is 3 way we can handle revalidation:
    // 1. We could just let the revalidation go as normal, but due to race condtions the revalidation will be unreliable
    // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
    // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
    headers: { ...internalEvent.headers, purpose: "prefetch" },
    body: internalEvent.body,
    remoteAddress: internalEvent.remoteAddress,
  };
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  setNextjsPrebundledReact(internalEvent.rawPath, config);
  await processRequest(req, res);

  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  const headers = ServerResponse.headers(res);
  const isBase64Encoded = isBinaryContentType(
    Array.isArray(headers["content-type"])
      ? headers["content-type"][0]
      : headers["content-type"]
  );
  const encoding = isBase64Encoded ? "base64" : "utf8";
  const body = ServerResponse.body(res).toString(encoding);
  debug("ServerResponse data", { statusCode, headers, isBase64Encoded, body });

  // WORKAROUND: `NextServer` does not set cache response headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-response-headers-for-html-pages
  if (htmlPages.includes(internalEvent.rawPath) && headers["cache-control"]) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }

  // WORKAROUND: `NextServer` does not revalidate correctly
  // x-nextjs-cache should be allowed in cloudfront headers
  const nextJsCacheHeader = headers?.["x-nextjs-cache"];
  if (nextJsCacheHeader === "STALE" || nextJsCacheHeader === "MISS") {
    headers!["cache-control"] =
      "public, max-age=0, s-maxage=0, must-revalidate";
    const etag = headers?.etag;
    await revalidateInBackground(internalEvent.rawPath, etag);
  }

  return convertTo({
    type: internalEvent.type,
    statusCode,
    headers,
    isBase64Encoded,
    body,
  });
}

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function setNextjsPrebundledReact(rawPath: string, config: any) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react

  // Get route pattern
  const route = routesManifest.find((route) =>
    new RegExp(route.regex).test(rawPath ?? "")
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

async function processRequest(req: IncomingMessage, res: ServerResponse) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    await requestHandler(req, res);
  } catch (e: any) {
    console.error("NextJS request failed.", e);

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          message: "Server failed to respond.",
          details: e,
        },
        null,
        2
      )
    );
  }
}

function formatAPIGatewayFailoverResponse() {
  return { statusCode: 503 };
}

function formatCloudFrontFailoverResponse(event: CloudFrontRequestEvent) {
  return event.Records[0].cf.request;
}

function formatWarmerResponse(event: WarmerEvent) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ serverId } satisfies WarmerResponse);
    }, event.delay);
  });
}
