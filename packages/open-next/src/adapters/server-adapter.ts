import path from "node:path";
import crypto from "node:crypto";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEvent,
  CloudFrontRequestEvent,
} from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import {
  generateUniqueId,
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadHtmlPages,
  loadPublicAssets,
  loadRoutesManifest,
  setNodeEnv,
} from "./util.js";
import { isBinaryContentType } from "./binary.js";
import { debug, error, awsLogger } from "./logger.js";
import { convertFrom, convertTo } from "./event-mapper.js";
import {
  overrideHooks as overrideNextjsRequireHooks,
  applyOverride as applyNextjsRequireHooksOverride,
} from "./require-hooks.js";
import type { WarmerEvent, WarmerResponse } from "./warmer-function.js";

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

const NEXT_DIR = path.join(__dirname, ".next");
const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
debug({ NEXT_DIR, OPEN_NEXT_DIR });

setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();
const config = loadConfig(NEXT_DIR);
const htmlPages = loadHtmlPages(NEXT_DIR);
const routesManifest = loadRoutesManifest(NEXT_DIR);
const appPathsManifestKeys = loadAppPathsManifestKeys(NEXT_DIR);
const publicAssets = loadPublicAssets(OPEN_NEXT_DIR);
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

const requestHandler = createRequestHandler();

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
  // TODO: This is no longer required if each top-level file and folder in "/public"
  //       is handled by a separate cache behavior. Leaving here for backward compatibility.
  //       Remove this on next major release.
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
  setNextjsPrebundledReact(internalEvent.rawPath);
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

  fixCacheHeaderForHtmlPages(internalEvent.rawPath, headers);
  fixSWRCacheHeader(headers);
  await revalidateIfRequired(
    internalEvent.headers.host,
    internalEvent.rawPath,
    headers
  );

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

function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = loadBuildId(NEXT_DIR);
}

function setNextjsPrebundledReact(rawPath: string) {
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

function createRequestHandler() {
  return new NextServer.default({
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

async function processRequest(req: IncomingMessage, res: ServerResponse) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    await requestHandler(req, res);
  } catch (e: any) {
    error("NextJS request failed.", e);

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

function fixCacheHeaderForHtmlPages(
  rawPath: string,
  headers: Record<string, string | undefined>
) {
  // WORKAROUND: `NextServer` does not set cache headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-headers-for-html-pages
  if (htmlPages.includes(rawPath) && headers["cache-control"]) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
}

function fixSWRCacheHeader(headers: Record<string, string | undefined>) {
  // WORKAROUND: `NextServer` does not set correct SWR cache headers — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-correct-swr-cache-headers
  if (headers["cache-control"]?.includes("stale-while-revalidate")) {
    headers["cache-control"] = headers["cache-control"].replace(
      "stale-while-revalidate",
      "stale-while-revalidate=2592000" // 30 days
    );
  }
}

async function revalidateIfRequired(
  host: string,
  rawPath: string,
  headers: Record<string, string | undefined>
) {
  if (headers["x-nextjs-cache"] !== "STALE") return;

  // If the cache is stale, we revalidate in the background
  // In order for CloudFront SWR to work, we set the stale-while-revalidate value to 2 seconds
  // This will cause CloudFront to cache the stale data for a short period of time while we revalidate in the background
  // Once the revalidation is complete, CloudFront will serve the fresh data
  headers["cache-control"] = "s-maxage=2, stale-while-revalidate=2592000";

  // We need to pass etag to the revalidation queue to try to bypass the default 5 min deduplication window.
  // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html
  // If you need to have a revalidation happen more frequently than 5 minutes,
  // your page will need to have a different etag to bypass the deduplication window.
  // If data has the same etag during these 5 min dedup window, it will be deduplicated and not revalidated.
  try {
    const hash = (str: string) => crypto.createHash('md5').update(str).digest('hex')

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: REVALIDATION_QUEUE_URL,
        MessageDeduplicationId: hash(`${rawPath}-${headers.etag}`),
        MessageBody: JSON.stringify({ host, url: rawPath }),
        MessageGroupId: "revalidate",
      })
    );
  } catch (e) {
    debug(`Failed to revalidate stale page ${rawPath}`);
    debug(e);
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
