import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import { OutgoingHttpHeaders, ServerResponse } from "http";

import { BuildId, HtmlPages } from "../../config/index.js";
import { InternalEvent } from "../../event-mapper.js";
import { OpenNextNodeResponse } from "../../http/openNextResponse.js";
import { IncomingMessage } from "../../http/request.js";
import { ServerlessResponse } from "../../http/response.js";
import { ResponseStream } from "../../http/responseStreaming.js";
import { awsLogger, debug } from "../../logger.js";

declare global {
  var openNextDebug: boolean;
  var openNextVersion: string;
  var lastModified: number;
}

enum CommonHeaders {
  CACHE_CONTROL = "cache-control",
  NEXT_CACHE = "x-nextjs-cache",
}

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerlessResponse,
) {
  const HttpProxy = require("next/dist/compiled/http-proxy") as any;

  const proxy = new HttpProxy({
    changeOrigin: true,
    ignorePath: true,
    xfwd: true,
  });

  await new Promise<void>((resolve, reject) => {
    proxy.on("proxyRes", (proxyRes: ServerResponse) => {
      const body: Uint8Array[] = [];
      proxyRes.on("data", function (chunk) {
        body.push(chunk);
      });
      proxyRes.on("end", function () {
        const newBody = Buffer.concat(body).toString();
        debug(`Proxying response`, {
          headers: proxyRes.getHeaders(),
          body: newBody,
        });
        res.end(newBody);
        resolve();
      });
    });

    proxy.on("error", (err: any) => {
      reject(err);
    });

    debug(`Proxying`, { url: req.url, headers: req.headers });

    proxy.web(req, res, {
      target: req.url,
      headers: req.headers,
    });
  });
}

export function fixCacheHeaderForHtmlPages(
  rawPath: string,
  headers: OutgoingHttpHeaders,
) {
  // WORKAROUND: `NextServer` does not set cache headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-headers-for-html-pages
  if (HtmlPages.includes(rawPath) && headers[CommonHeaders.CACHE_CONTROL]) {
    headers[CommonHeaders.CACHE_CONTROL] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
}

export function fixSWRCacheHeader(headers: OutgoingHttpHeaders) {
  // WORKAROUND: `NextServer` does not set correct SWR cache headers — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-correct-swr-cache-headers
  let cacheControl = headers[CommonHeaders.CACHE_CONTROL];
  if (!cacheControl) return;
  if (Array.isArray(cacheControl)) {
    cacheControl = cacheControl.join(",");
  }
  if (typeof cacheControl !== "string") return;
  headers[CommonHeaders.CACHE_CONTROL] = cacheControl.replace(
    /\bstale-while-revalidate(?!=)/,
    "stale-while-revalidate=2592000", // 30 days
  );
}

export function addOpenNextHeader(headers: OutgoingHttpHeaders) {
  headers["X-OpenNext"] = "1";
  if (globalThis.openNextDebug) {
    headers["X-OpenNext-Version"] = globalThis.openNextVersion;
  }
}

export async function revalidateIfRequired(
  host: string,
  rawPath: string,
  headers: OutgoingHttpHeaders,
  req?: IncomingMessage,
) {
  fixISRHeaders(headers);

  if (headers[CommonHeaders.NEXT_CACHE] === "STALE") {
    // If the URL is rewritten, revalidation needs to be done on the rewritten URL.
    // - Link to Next.js doc: https://nextjs.org/docs/pages/building-your-application/data-fetching/incremental-static-regeneration#on-demand-revalidation
    // - Link to NextInternalRequestMeta: https://github.com/vercel/next.js/blob/57ab2818b93627e91c937a130fb56a36c41629c3/packages/next/src/server/request-meta.ts#L11
    // @ts-ignore
    const internalMeta = req?.[Symbol.for("NextInternalRequestMeta")];

    // When using Pages Router, two requests will be received:
    // 1. one for the page: /foo
    // 2. one for the json data: /_next/data/BUILD_ID/foo.json
    // The rewritten url is correct for 1, but that for the second request
    // does not include the "/_next/data/" prefix. Need to add it.
    const revalidateUrl = internalMeta?._nextDidRewrite
      ? rawPath.startsWith("/_next/data/")
        ? `/_next/data/${BuildId}${internalMeta?._nextRewroteUrl}.json`
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

      const lastModified =
        globalThis.lastModified > 0 ? globalThis.lastModified : "";

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: REVALIDATION_QUEUE_URL,
          MessageDeduplicationId: hash(`${rawPath}-${lastModified}`),
          MessageBody: JSON.stringify({ host, url: revalidateUrl }),
          MessageGroupId: generateMessageGroupId(rawPath),
        }),
      );
    } catch (e) {
      debug(`Failed to revalidate stale page ${rawPath}`);
      debug(e);
    }
  }
}

// Since we're using a FIFO queue, every messageGroupId is treated sequentially
// This could cause a backlog of messages in the queue if there is too much page to
// revalidate at once. To avoid this, we generate a random messageGroupId for each
// revalidation request.
// We can't just use a random string because we need to ensure that the same rawPath
// will always have the same messageGroupId.
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript#answer-47593316
function generateMessageGroupId(rawPath: string) {
  let a = cyrb128(rawPath);
  // We use mulberry32 to generate a random int between 0 and MAX_REVALIDATE_CONCURRENCY
  var t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const randomFloat = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  // This will generate a random int between 0 and MAX_REVALIDATE_CONCURRENCY
  // This means that we could have 1000 revalidate request at the same time
  const maxConcurrency = parseInt(
    process.env.MAX_REVALIDATE_CONCURRENCY ?? "10",
  );
  const randomInt = Math.floor(randomFloat * maxConcurrency);
  return `revalidate-${randomInt}`;
}

// Used to generate a hash int from a string
function cyrb128(str: string) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  (h1 ^= h2 ^ h3 ^ h4), (h2 ^= h1), (h3 ^= h1), (h4 ^= h1);
  return h1 >>> 0;
}

export function fixISRHeaders(headers: OutgoingHttpHeaders) {
  if (headers[CommonHeaders.NEXT_CACHE] === "REVALIDATED") {
    headers[CommonHeaders.CACHE_CONTROL] =
      "private, no-cache, no-store, max-age=0, must-revalidate";
    return;
  }
  if (
    headers[CommonHeaders.NEXT_CACHE] === "HIT" &&
    globalThis.lastModified > 0
  ) {
    // calculate age
    const age = Math.round((Date.now() - globalThis.lastModified) / 1000);
    // extract s-maxage from cache-control
    const regex = /s-maxage=(\d+)/;
    const cacheControl = headers[CommonHeaders.CACHE_CONTROL];
    if (!cacheControl || typeof cacheControl !== "string") return;
    const match = cacheControl.match(regex);
    const sMaxAge = match ? parseInt(match[1]) : undefined;

    // 31536000 is the default s-maxage value for SSG pages
    if (sMaxAge && sMaxAge !== 31536000) {
      const remainingTtl = Math.max(sMaxAge - age, 1);
      headers[
        CommonHeaders.CACHE_CONTROL
      ] = `s-maxage=${remainingTtl}, stale-while-revalidate=2592000`;
    }

    // reset lastModified
    globalThis.lastModified = 0;
  }
  if (headers[CommonHeaders.NEXT_CACHE] !== "STALE") return;

  // If the cache is stale, we revalidate in the background
  // In order for CloudFront SWR to work, we set the stale-while-revalidate value to 2 seconds
  // This will cause CloudFront to cache the stale data for a short period of time while we revalidate in the background
  // Once the revalidation is complete, CloudFront will serve the fresh data
  headers[CommonHeaders.CACHE_CONTROL] =
    "s-maxage=2, stale-while-revalidate=2592000";
}

export function createServerResponse(
  internalEvent: InternalEvent,
  headers: Record<string, string | string[] | undefined>,
  responseStream?: ResponseStream,
) {
  return new OpenNextNodeResponse(
    (_headers) => {
      fixCacheHeaderForHtmlPages(internalEvent.rawPath, _headers);
      fixSWRCacheHeader(_headers);
      addOpenNextHeader(_headers);
      fixISRHeaders(_headers);
    },
    async (_headers) => {
      await revalidateIfRequired(
        internalEvent.headers.host,
        internalEvent.rawPath,
        _headers,
      );
    },
    responseStream,
    headers,
  );
}
