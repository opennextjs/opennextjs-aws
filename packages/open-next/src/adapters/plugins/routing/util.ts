import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import path from "path";

import { awsLogger, debug } from "../../logger.js";
import { IncomingMessage } from "../../request.js";
import { ServerResponse } from "../../response.js";
import { loadBuildId, loadHtmlPages } from "../../util.js";

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;
const NEXT_DIR = path.join(__dirname, ".next");
const htmlPages = loadHtmlPages(NEXT_DIR);
const buildId = loadBuildId(NEXT_DIR);

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

export async function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  const HttpProxy = require("next/dist/compiled/http-proxy") as any;

  const proxy = new HttpProxy({
    changeOrigin: true,
    ignorePath: true,
    xfwd: true,
  });

  await new Promise<void>((resolve, reject) => {
    proxy.on("proxyRes", () => {
      resolve();
    });

    proxy.on("error", (err: any) => {
      reject(err);
    });

    proxy.web(req, res, {
      target: req.url,
      headers: req.headers,
    });
  });
}

export function fixCacheHeaderForHtmlPages(
  rawPath: string,
  headers: Record<string, string | undefined>,
) {
  // WORKAROUND: `NextServer` does not set cache headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-headers-for-html-pages
  if (htmlPages.includes(rawPath) && headers["cache-control"]) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
}

export function fixSWRCacheHeader(headers: Record<string, string | undefined>) {
  // WORKAROUND: `NextServer` does not set correct SWR cache headers — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-correct-swr-cache-headers
  if (headers["cache-control"]?.includes("stale-while-revalidate")) {
    headers["cache-control"] = headers["cache-control"].replace(
      "stale-while-revalidate",
      "stale-while-revalidate=2592000", // 30 days
    );
  }
}

export function addOpenNextHeader(headers: Record<string, string | undefined>) {
  headers["X-OpenNext"] = process.env.OPEN_NEXT_VERSION;
}

export async function revalidateIfRequired(
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
