import crypto from "node:crypto";
import path from "node:path";

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";

import { isBinaryContentType } from "./binary.js";
import { convertFrom, convertTo } from "./event-mapper.js";
import { awsLogger, debug, error } from "./logger.js";
import { handler as serverHandler } from "./plugins/serverHandler.js";
import type { RouteDefinition } from "./next-types.js";
import type { RewriteMatcher } from "./next-types.js";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import { handleRedirects, handleRewrites, proxyRequest } from "./routing.js";
import {
  generateUniqueId,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadHtmlPages,
  loadPublicAssets,
  setNodeEnv,
} from "./util.js";
import type { WarmerEvent, WarmerResponse } from "./warmer-function.js";

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
export const config = loadConfig(NEXT_DIR);

const configHeaders = loadConfigHeaders(NEXT_DIR);

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

debug({ NEXT_DIR, OPEN_NEXT_DIR });

const buildId = loadBuildId(NEXT_DIR);
setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();
const htmlPages = loadHtmlPages(NEXT_DIR);

const publicAssets = loadPublicAssets(OPEN_NEXT_DIR);
// Generate a 6 letter unique server ID
const serverId = `server-${generateUniqueId()}`;

/////////////
// Handler //
/////////////

export async function handler(
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent,
) {
  debug("event", event);
  // Handler warmer
  if ("type" in event) {
    return formatWarmerResponse(event);
  }

  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event, buildId);

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

  const redirect = handleRedirects(internalEvent, routesManifest.redirects);
  if (redirect) {
    return redirect;
  }

  const { rawPath, url, isExternalRewrite } = handleRewrites(
    internalEvent,
    routesManifest.rewrites,
  );

  const reqProps = {
    method: internalEvent.method,
    url,
    //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
    // There is 3 way we can handle revalidation:
    // 1. We could just let the revalidation go as normal, but due to race condtions the revalidation will be unreliable
    // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
    // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
    headers: { ...internalEvent.headers, purpose: "prefetch" },
    body: internalEvent.body,
    remoteAddress: internalEvent.remoteAddress,
  };
  addNextConfigHeaders(reqProps.url, reqProps.headers);
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  await processRequest(req, res, internalEvent);

  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  const headers = ServerResponse.headers(res);
  const isBase64Encoded = isBinaryContentType(
    Array.isArray(headers["content-type"])
      ? headers["content-type"][0]
      : headers["content-type"],
  );
  const encoding = isBase64Encoded ? "base64" : "utf8";
  const body = ServerResponse.body(res).toString(encoding);

  debug("ServerResponse data", { statusCode, headers, isBase64Encoded, body });

  // Load the headers in next.config.js to the response.
  addNextConfigHeaders(reqProps.url, headers);
  fixCacheHeaderForHtmlPages(internalEvent.rawPath, headers);
  fixSWRCacheHeader(headers);
  addOpenNextHeader(headers);

  await revalidateIfRequired(
    internalEvent.headers.host,
    internalEvent.rawPath,
    headers,
    req,
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
  process.env.NEXT_BUILD_ID = buildId;
}

async function processRequest(
  req: IncomingMessage,
  res: ServerResponse,
  internalEvent: InternalEvent,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    // `serverHandler` is replaced at build time depending on user's
    // nextjs version to patch Nextjs 13.4.x and future breaking changes.
    await serverHandler(req, res, { internalEvent, buildId });
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
        2,
      ),
    );
  }
}

function fixCacheHeaderForHtmlPages(
  rawPath: string,
  headers: Record<string, string | undefined>,
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
      "stale-while-revalidate=2592000", // 30 days
    );
  }
}

function addOpenNextHeader(headers: Record<string, string | undefined>) {
  headers["X-OpenNext"] = process.env.OPEN_NEXT_VERSION;
}

function addNextConfigHeaders(
  url: string,
  requestHeaders: Record<string, string | undefined>,
) {
  if (!configHeaders) return;

  for (const { source, headers } of configHeaders) {
    if (new RegExp(source).test(url)) {
      headers.forEach((h) => {
        requestHeaders[h.key] = h.value;
      });
    }
  }
}

async function revalidateIfRequired(
  host: string,
  rawPath: string,
  headers: Record<string, string | undefined>,
  req: IncomingMessage,
) {
  if (headers["x-nextjs-cache"] !== "STALE") return;

  // If the cache is stale, we revalidate in the background
  // In order for CloudFront SWR to work, we set the stale-while-revalidate value to 2 seconds
  // This will cause CloudFront to cache the stale data for a short period of time while we revalidate in the background
  // Once the revalidation is complete, CloudFront will serve the fresh data
  headers["cache-control"] = "s-maxage=2, stale-while-revalidate=2592000";

  // If the URL is rewritten, revalidation needs to be done on the rewritten URL.
  // - Link to Next.js doc: https://nextjs.org/docs/pages/building-your-application/data-fetching/incremental-static-regeneration#on-demand-revalidation
  // - Link to NextInternalRequestMeta: https://github.com/vercel/next.js/blob/57ab2818b93627e91c937a130fb56a36c41629c3/packages/next/src/server/request-meta.ts#L11
  // @ts-ignore
  const internalMeta = req[Symbol.for("NextInternalRequestMeta")];
  // When using Pages Router, two requests will be received:
  // 1. one for the page: /foo
  // 2. one for the json data: /_next/data/BUILD_ID/foo.json
  // The rewritten url is correct for 1, but that for the second request
  // does not include the "/_next/data/" prefix. Need to add it.
  const revalidateUrl = internalMeta?._nextDidRewrite
    ? rawPath.startsWith("/_next/data/")
      ? `/_next/data/${buildId}${internalMeta?._nextRewroteUrl}.json`
      : internalMeta?._nextRewroteUrl
    : rawPath;

  // We need to pass etag to the revalidation queue to try to bypass the default 5 min deduplication window.
  // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html
  // If you need to have a revalidation happen more frequently than 5 minutes,
  // your page will need to have a different etag to bypass the deduplication window.
  // If data has the same etag during these 5 min dedup window, it will be deduplicated and not revalidated.
  try {
    const hash = (str: string) =>
      crypto.createHash("md5").update(str).digest("hex");

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: REVALIDATION_QUEUE_URL,
        MessageDeduplicationId: hash(`${rawPath}-${headers.etag}`),
        MessageBody: JSON.stringify({ host, url: revalidateUrl }),
        MessageGroupId: "revalidate",
      }),
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
