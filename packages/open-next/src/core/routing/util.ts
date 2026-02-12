import crypto from "node:crypto";
import type { OutgoingHttpHeaders } from "node:http";
import { parse as parseQs, stringify as stringifyQs } from "node:querystring";

import { BuildId, HtmlPages, NextConfig } from "config/index.js";
import type { IncomingMessage } from "http/index.js";
import { OpenNextNodeResponse } from "http/openNextResponse.js";
import { getQueryFromIterator, parseHeaders } from "http/util.js";
import type {
  FunctionsConfigManifest,
  MiddlewareManifest,
} from "types/next-types";
import type {
  InternalEvent,
  InternalResult,
  RoutingResult,
  StreamCreator,
} from "types/open-next.js";

import { ReadableStream } from "node:stream/web";
import { debug, error } from "../../adapters/logger.js";
import { isBinaryContentType } from "../../utils/binary.js";
import { localizePath } from "./i18n/index.js";
import { generateMessageGroupId } from "./queue.js";

/**
 *
 * @__PURE__
 */
export function isExternal(url?: string, host?: string) {
  if (!url) return false;
  const pattern = /^https?:\/\//;
  if (!pattern.test(url)) return false;

  if (host) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.host !== host;
    } catch {
      // If URL parsing fails, fall back to substring check
      return !url.includes(host);
    }
  }
  return true;
}

export function convertFromQueryString(query: string) {
  if (query === "") return {};
  const queryParts = query.split("&");
  return getQueryFromIterator(
    queryParts.map((p) => {
      const [key, value] = p.split("=");
      return [key, value] as const;
    }),
  );
}

/**
 *
 * @__PURE__
 */
export function getUrlParts(url: string, isExternal: boolean) {
  if (!isExternal) {
    const regex = /\/([^?]*)\??(.*)/;
    const match = url.match(regex);
    return {
      hostname: "",
      pathname: match?.[1] ? `/${match[1]}` : url,
      protocol: "",
      queryString: match?.[2] ?? "",
    };
  }

  const regex = /^(https?:)\/\/?([^\/\s]+)(\/[^?]*)?(\?.*)?/;
  const match = url.match(regex);
  if (!match) {
    throw new Error(`Invalid external URL: ${url}`);
  }
  return {
    protocol: match[1] ?? "https:",
    hostname: match[2],
    pathname: match[3] ?? "",
    queryString: match[4]?.slice(1) ?? "",
  };
}

/**
 * Creates an URL to a Next page
 *
 * @param baseUrl Used to get the origin
 * @param path The pathname
 * @returns The Next URL considering the basePath
 *
 * @__PURE__
 */
export function constructNextUrl(baseUrl: string, path: string) {
  // basePath is generated as "" if not provided on Next.js 15 (not sure about older versions)
  const nextBasePath = NextConfig.basePath ?? "";
  const url = new URL(`${nextBasePath}${path}`, baseUrl);
  return url.href;
}

/**
 *
 * @__PURE__
 */
export function convertRes(res: OpenNextNodeResponse): InternalResult {
  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  // When using HEAD requests, it seems that flushHeaders is not called, not sure why
  // Probably some kind of race condition
  const headers = parseHeaders(res.getFixedHeaders());
  const isBase64Encoded =
    isBinaryContentType(headers["content-type"]) ||
    !!headers["content-encoding"];
  const body = new ReadableStream({
    pull(controller) {
      if (!res._chunks || res._chunks.length === 0) {
        controller.close();
        return;
      }

      controller.enqueue(res._chunks.shift());
    },
  });
  return {
    type: "core",
    statusCode,
    headers,
    body,
    isBase64Encoded,
  };
}

/**
 * Make sure that multi-value query parameters are transformed to
 * ?key=value1&key=value2&... so that Next converts those parameters
 * to an array when reading the query parameters
 * query should be properly encoded before using this function
 * @__PURE__
 */
export function convertToQueryString(query: Record<string, string | string[]>) {
  const queryStrings: string[] = [];
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => queryStrings.push(`${key}=${entry}`));
    } else {
      queryStrings.push(`${key}=${value}`);
    }
  });

  return queryStrings.length > 0 ? `?${queryStrings.join("&")}` : "";
}

/**
 * Given a raw query string, returns a record with key value-array pairs
 * similar to how multiValueQueryStringParameters are structured
 * @__PURE__
 */
export function convertToQuery(querystring: string) {
  if (!querystring) return {};
  const query = new URLSearchParams(querystring);
  const queryObject: Record<string, string[] | string> = {};

  for (const key of query.keys()) {
    const queries = query.getAll(key);
    queryObject[key] = queries.length > 1 ? queries : queries[0];
  }

  return queryObject;
}

/**
 *
 * @__PURE__
 */
export function getMiddlewareMatch(
  middlewareManifest: MiddlewareManifest,
  functionsManifest?: FunctionsConfigManifest,
) {
  if (functionsManifest?.functions?.["/_middleware"]) {
    return (
      functionsManifest.functions["/_middleware"].matchers?.map(
        ({ regexp }) => new RegExp(regexp),
      ) ?? [/.*/]
    );
  }
  const rootMiddleware = middlewareManifest.middleware["/"];
  if (!rootMiddleware?.matchers) return [];
  return rootMiddleware.matchers.map(({ regexp }) => new RegExp(regexp));
}

/**
 *
 * @__PURE__
 */
export function escapeRegex(
  str: string,
  { isPath }: { isPath?: boolean } = {},
) {
  const result = str
    .replaceAll("(.)", "_µ1_")
    .replaceAll("(..)", "_µ2_")
    .replaceAll("(...)", "_µ3_");
  return isPath ? result : result.replaceAll("+", "_µ4_");
}

/**
 *
 * @__PURE__
 */
export function unescapeRegex(str: string) {
  return str
    .replaceAll("_µ1_", "(.)")
    .replaceAll("_µ2_", "(..)")
    .replaceAll("_µ3_", "(...)")
    .replaceAll("_µ4_", "+");
}

/**
 * @__PURE__
 */
export function convertBodyToReadableStream(
  method: string,
  body?: string | Buffer,
) {
  if (method === "GET" || method === "HEAD") return undefined;
  if (!body) return undefined;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
}

enum CommonHeaders {
  CACHE_CONTROL = "cache-control",
  NEXT_CACHE = "x-nextjs-cache",
}

/**
 *
 * @__PURE__
 */
export function fixCacheHeaderForHtmlPages(
  internalEvent: InternalEvent,
  headers: OutgoingHttpHeaders,
) {
  // We don't want to cache error pages
  if (internalEvent.rawPath === "/404" || internalEvent.rawPath === "/500") {
    if (process.env.OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS === "true") {
      return;
    }
    headers[CommonHeaders.CACHE_CONTROL] =
      "private, no-cache, no-store, max-age=0, must-revalidate";
    return;
  }
  const localizedPath = localizePath(internalEvent);
  // WORKAROUND: `NextServer` does not set cache headers for HTML pages
  // https://opennext.js.org/aws/v2/advanced/workaround#workaround-nextserver-does-not-set-cache-headers-for-html-pages
  // Requests containing an `x-middleware-prefetch` header must not be cached
  if (
    HtmlPages.find(
      (path) => `${NextConfig.basePath ?? ""}${path}` === localizedPath,
    ) &&
    !internalEvent.headers["x-middleware-prefetch"]
  ) {
    headers[CommonHeaders.CACHE_CONTROL] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
}

/**
 *
 * @__PURE__
 */
export function fixSWRCacheHeader(headers: OutgoingHttpHeaders) {
  // WORKAROUND: `NextServer` does not set correct SWR cache headers — https://github.com/sst/open-next#workaround-nextserver-does-not-set-correct-swr-cache-headers
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

/**
 *
 * @__PURE__
 */
export function addOpenNextHeader(headers: OutgoingHttpHeaders) {
  if (NextConfig.poweredByHeader) {
    headers["X-OpenNext"] = "1";
  }
  if (globalThis.openNextDebug) {
    headers["X-OpenNext-Version"] = globalThis.openNextVersion;
  }
  if (process.env.OPEN_NEXT_REQUEST_ID_HEADER || globalThis.openNextDebug) {
    headers["X-OpenNext-RequestId"] =
      globalThis.__openNextAls.getStore()?.requestId;
  }
}

/**
 *
 * @__PURE__
 */
export async function revalidateIfRequired(
  host: string,
  rawPath: string,
  headers: OutgoingHttpHeaders,
  req?: IncomingMessage,
) {
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
        globalThis.__openNextAls.getStore()?.lastModified ?? 0;

      // For some weird cases, lastModified is not set, haven't been able to figure out yet why
      // For those cases we add the etag to the deduplication id, it might help
      const eTag = `${headers.etag ?? headers.ETag ?? ""}`;

      await globalThis.queue.send({
        MessageBody: { host, url: revalidateUrl, eTag, lastModified },
        MessageDeduplicationId: hash(`${rawPath}-${lastModified}-${eTag}`),
        MessageGroupId: generateMessageGroupId(rawPath),
      });
    } catch (e) {
      error(`Failed to revalidate stale page ${rawPath}`, e);
    }
  }
}

/**
 *
 * @__PURE__
 */
export function fixISRHeaders(headers: OutgoingHttpHeaders) {
  const sMaxAgeRegex = /s-maxage=(\d+)/;
  const match = headers[CommonHeaders.CACHE_CONTROL]?.match(sMaxAgeRegex);
  const sMaxAge = match ? Number.parseInt(match[1]) : undefined;
  // We only apply the fix if the cache-control header contains s-maxage
  if (!sMaxAge) {
    return;
  }
  if (headers[CommonHeaders.NEXT_CACHE] === "REVALIDATED") {
    headers[CommonHeaders.CACHE_CONTROL] =
      "private, no-cache, no-store, max-age=0, must-revalidate";
    return;
  }
  const _lastModified = globalThis.__openNextAls.getStore()?.lastModified ?? 0;
  if (headers[CommonHeaders.NEXT_CACHE] === "HIT" && _lastModified > 0) {
    debug(
      "cache-control",
      headers[CommonHeaders.CACHE_CONTROL],
      _lastModified,
      Date.now(),
    );

    // 31536000 is the default s-maxage value for SSG pages
    if (sMaxAge && sMaxAge !== 31536000) {
      // calculate age
      const age = Math.round((Date.now() - _lastModified) / 1000);
      const remainingTtl = Math.max(sMaxAge - age, 1);
      headers[CommonHeaders.CACHE_CONTROL] =
        `s-maxage=${remainingTtl}, stale-while-revalidate=2592000`;
    }
  }
  if (headers[CommonHeaders.NEXT_CACHE] !== "STALE") return;

  // If the cache is stale, we revalidate in the background
  // In order for CloudFront SWR to work, we set the stale-while-revalidate value to 2 seconds
  // This will cause CloudFront to cache the stale data for a short period of time while we revalidate in the background
  // Once the revalidation is complete, CloudFront will serve the fresh data
  headers[CommonHeaders.CACHE_CONTROL] =
    "s-maxage=2, stale-while-revalidate=2592000";
}

/**
 *
 * @param internalEvent
 * @param headers
 * @param responseStream
 * @returns
 * @__PURE__
 */
export function createServerResponse(
  routingResult: RoutingResult,
  headers: Record<string, string | string[] | undefined>,
  responseStream?: StreamCreator,
) {
  const internalEvent = routingResult.internalEvent;
  return new OpenNextNodeResponse(
    (_headers) => {
      fixCacheHeaderForHtmlPages(internalEvent, _headers);
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
      await invalidateCDNOnRequest(routingResult, _headers);
    },
    responseStream,
    headers,
    routingResult.rewriteStatusCode,
  );
}

// This function is used only for `res.revalidate()`
export async function invalidateCDNOnRequest(
  params: RoutingResult,
  headers: OutgoingHttpHeaders,
) {
  const { internalEvent, resolvedRoutes, initialURL } = params;
  const initialPath = new URL(initialURL).pathname;
  const isIsrRevalidation = internalEvent.headers["x-isr"] === "1";
  if (
    !isIsrRevalidation &&
    headers[CommonHeaders.NEXT_CACHE] === "REVALIDATED"
  ) {
    await globalThis.cdnInvalidationHandler.invalidatePaths([
      {
        initialPath,
        rawPath: internalEvent.rawPath,
        resolvedRoutes,
      },
    ]);
  }
}

/**
 * Normalizes the Location header to either be a relative path or a full URL.
 * If the Location header is relative to the origin, it will return a relative path.
 * If it is an absolute URL, it will return the full URL.
 * Redirects from Next config query parameters are encoded using `stringifyQs`
 * Redirects from the middleware the query parameters are not encoded.
 *
 * @param location The Location header value
 * @param baseUrl The base URL to use for relative paths (i.e the original request URL)
 * @param encodeQuery Optional flag to indicate if query parameters should be encoded in the Location header
 * @returns An absolute or relative Location header value
 */
export function normalizeLocationHeader(
  location: string,
  baseUrl: string,
  encodeQuery = false,
): string {
  if (!URL.canParse(location)) {
    // If the location is not a valid URL, return it as-is
    return location;
  }

  const locationURL = new URL(location);
  const origin = new URL(baseUrl).origin;

  let search = locationURL.search;
  // If encodeQuery is true, we need to encode the query parameters
  // We could have used URLSearchParams, but that doesn't match what Next does.
  if (encodeQuery && search) {
    search = `?${stringifyQs(parseQs(search.slice(1)))}`;
  }
  const href = `${locationURL.origin}${locationURL.pathname}${search}${locationURL.hash}`;
  // The URL is relative if the origin is the same as the base URL's origin
  if (locationURL.origin === origin) {
    return href.slice(origin.length);
  }
  return href;
}
