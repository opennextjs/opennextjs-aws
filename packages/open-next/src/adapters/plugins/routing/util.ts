import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import path from "path";
import { compile, match } from "path-to-regexp";

import { InternalEvent, InternalResult } from "../../event-mapper.js";
import { awsLogger, debug } from "../../logger.js";
import {
  Header,
  RedirectDefinition,
  RewriteDefinition,
  RewriteMatcher,
} from "../../next-types.js";
import { IncomingMessage } from "../../request.js";
import { ServerResponse } from "../../response.js";
import {
  escapeRegex,
  loadBuildId,
  loadHtmlPages,
  unescapeRegex,
} from "../../util.js";

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;
const NEXT_DIR = path.join(__dirname, ".next");
const htmlPages = loadHtmlPages(NEXT_DIR);
const buildId = loadBuildId(NEXT_DIR);

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

const redirectMatcher =
  (
    headers: Record<string, string>,
    cookies: Record<string, string>,
    query: Record<string, string | string[]>,
  ) =>
  (redirect: RewriteMatcher) => {
    switch (redirect.type) {
      case "header":
        return (
          headers?.[redirect.key.toLowerCase()] &&
          new RegExp(redirect.value ?? "").test(
            headers[redirect.key.toLowerCase()] ?? "",
          )
        );
      case "cookie":
        return (
          cookies?.[redirect.key] &&
          new RegExp(redirect.value ?? "").test(cookies[redirect.key] ?? "")
        );
      case "query":
        return query[redirect.key] && Array.isArray(redirect.value)
          ? redirect.value.reduce(
              (prev, current) =>
                prev || new RegExp(current).test(query[redirect.key] as string),
              false,
            )
          : new RegExp(redirect.value ?? "").test(
              (query[redirect.key] as string | undefined) ?? "",
            );
      case "host":
        return (
          headers?.host && new RegExp(redirect.value ?? "").test(headers.host)
        );
      default:
        return false;
    }
  };

function isExternal(url?: string) {
  if (!url) return false;
  const pattern = /^https?:\/\//;
  return pattern.test(url);
}

function getUrlParts(url: string, isExternal: boolean) {
  if (!isExternal) {
    return {
      hostname: "",
      pathname: url,
      protocol: "",
    };
  }
  const { hostname, pathname, protocol } = new URL(url);
  return {
    hostname,
    pathname,
    protocol,
  };
}

export function handleRewrites<T extends RewriteDefinition>(
  internalEvent: InternalEvent,
  rewrites: T[],
) {
  const { rawPath, headers, query, cookies } = internalEvent;
  const matcher = redirectMatcher(headers, cookies, query);
  const rewrite = rewrites.find(
    (route) =>
      new RegExp(route.regex).test(rawPath) &&
      (route.has
        ? route.has.reduce((acc, cur) => {
            if (acc === false) return false;
            return matcher(cur);
          }, true)
        : true) &&
      (route.missing
        ? route.missing.reduce((acc, cur) => {
            if (acc === false) return false;
            return !matcher(cur);
          }, true)
        : true),
  );

  //TODO: Fix this
  //@ts-ignore
  const urlQueryString = new URLSearchParams(query).toString();
  let rewrittenUrl = rawPath;
  const isExternalRewrite = isExternal(rewrite?.destination);
  debug("isExternalRewrite", isExternalRewrite);
  if (rewrite) {
    const { pathname, protocol, hostname } = getUrlParts(
      rewrite.destination,
      isExternalRewrite,
    );
    const toDestination = compile(escapeRegex(pathname ?? "") ?? "");
    const fromSource = match(escapeRegex(rewrite?.source) ?? "");
    const _match = fromSource(rawPath);
    if (_match) {
      const { params } = _match;
      const isUsingParams = Object.keys(params).length > 0;
      if (isUsingParams) {
        const rewrittenPath = unescapeRegex(toDestination(params));
        rewrittenUrl = isExternalRewrite
          ? `${protocol}//${hostname}${rewrittenPath}`
          : `/${rewrittenPath}`;
      } else {
        rewrittenUrl = rewrite.destination;
      }
      debug("rewrittenUrl", rewrittenUrl);
    }
  }

  return {
    internalEvent: {
      ...internalEvent,
      rawPath: rewrittenUrl,
      url: `${rewrittenUrl}${urlQueryString ? `?${urlQueryString}` : ""}`,
    },
    __rewrite: rewrite,
    isExternalRewrite,
  };
}

export function handleRedirects(
  internalEvent: InternalEvent,
  redirects: RedirectDefinition[],
): InternalResult | undefined {
  const { internalEvent: _internalEvent, __rewrite } = handleRewrites(
    internalEvent,
    redirects,
  );
  if (__rewrite && !__rewrite.internal) {
    return {
      type: internalEvent.type,
      statusCode: __rewrite.statusCode ?? 308,
      headers: {
        Location: _internalEvent.url,
      },
      body: "",
      isBase64Encoded: false,
    };
  }
}

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

export function addNextConfigHeaders(
  url: string,
  requestHeaders: Record<string, string | undefined>,
  configHeaders?: Header[] | undefined,
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
