import type { ReadableStream } from "node:stream/web";

import {
  FunctionsConfigManifest,
  MiddlewareManifest,
  NextConfig,
  PrerenderManifest,
} from "config/index.js";
import type { InternalEvent, InternalResult } from "types/open-next.js";
import { emptyReadableStream } from "utils/stream.js";

import { getQueryFromSearchParams } from "../../overrides/converters/utils.js";
import { localizePath } from "./i18n/index.js";
import {
  convertBodyToReadableStream,
  getMiddlewareMatch,
  isExternal,
  normalizeLocationHeader,
} from "./util.js";

const middlewareManifest = MiddlewareManifest;
const functionsConfigManifest = FunctionsConfigManifest;

const middleMatch = getMiddlewareMatch(
  middlewareManifest,
  functionsConfigManifest,
);

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

type MiddlewareEvent = InternalEvent & {
  responseHeaders?: Record<string, string | string[]>;
  isExternalRewrite?: boolean;
  rewriteStatusCode?: number;
};

type Middleware = (request: Request) => Response | Promise<Response>;
type MiddlewareLoader = () => Promise<{ default: Middleware }>;

function defaultMiddlewareLoader() {
  // @ts-expect-error - This is bundled
  return import("./middleware.mjs");
}

/**
 *
 * @param internalEvent the internal event
 * @param initialSearch the initial query string as it was received in the handler
 * @param middlewareLoader Only used for unit test
 * @returns `Promise<MiddlewareEvent | InternalResult>`
 */
export async function handleMiddleware(
  internalEvent: InternalEvent,
  initialSearch: string,
  middlewareLoader: MiddlewareLoader = defaultMiddlewareLoader,
): Promise<MiddlewareEvent | InternalResult> {
  const headers = internalEvent.headers;

  // We bypass the middleware if the request is internal
  // We should only do that if the request has the correct `x-prerender-revalidate` header
  // The `x-prerender-revalidate` header is set at build time and should be safe to trust
  if (
    headers["x-isr"] &&
    headers["x-prerender-revalidate"] ===
      PrerenderManifest.preview.previewModeId
  )
    return internalEvent;

  // We only need the normalizedPath to check if the middleware should run
  const normalizedPath = localizePath(internalEvent);
  const hasMatch = middleMatch.some((r) => r.test(normalizedPath));
  if (!hasMatch) return internalEvent;

  const initialUrl = new URL(normalizedPath, internalEvent.url);
  initialUrl.search = initialSearch;
  const url = initialUrl.href;

  const middleware = await middlewareLoader();

  const result: Response = await middleware.default({
    // `geo` is pre Next 15.
    geo: {
      // The city name is percent-encoded.
      // See https://github.com/vercel/vercel/blob/4cb6143/packages/functions/src/headers.ts#L94C19-L94C37
      city: decodeURIComponent(headers["x-open-next-city"]),
      country: headers["x-open-next-country"],
      region: headers["x-open-next-region"],
      latitude: headers["x-open-next-latitude"],
      longitude: headers["x-open-next-longitude"],
    },
    headers,
    method: internalEvent.method || "GET",
    nextConfig: {
      basePath: NextConfig.basePath,
      i18n: NextConfig.i18n,
      trailingSlash: NextConfig.trailingSlash,
    },
    url,
    body: convertBodyToReadableStream(internalEvent.method, internalEvent.body),
  } as unknown as Request);
  const statusCode = result.status;

  /* Apply override headers from middleware
    NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      }
    })
    Nextjs will set `x-middleware-override-headers` as a comma separated list of keys.
    All the keys will be prefixed with `x-middleware-request-<key>`

    We can delete `x-middleware-override-headers` and check if the key starts with
    x-middleware-request- to set the req headers
  */
  const responseHeaders = result.headers as Headers;
  const reqHeaders: Record<string, string> = {};
  const resHeaders: Record<string, string | string[]> = {};

  // These are internal headers used by Next.js, we don't want to expose them to the client
  const filteredHeaders = [
    "x-middleware-override-headers",
    "x-middleware-next",
    "x-middleware-rewrite",
    // We need to drop `content-encoding` because it will be decoded
    "content-encoding",
  ];

  const xMiddlewareKey = "x-middleware-request-";
  responseHeaders.forEach((value, key) => {
    if (key.startsWith(xMiddlewareKey)) {
      const k = key.substring(xMiddlewareKey.length);
      reqHeaders[k] = value;
    } else {
      if (filteredHeaders.includes(key.toLowerCase())) return;
      if (key.toLowerCase() === "set-cookie") {
        resHeaders[key] = resHeaders[key]
          ? [...resHeaders[key], value]
          : [value];
      } else if (
        REDIRECTS.has(statusCode) &&
        key.toLowerCase() === "location"
      ) {
        resHeaders[key] = normalizeLocationHeader(value, internalEvent.url);
      } else {
        resHeaders[key] = value;
      }
    }
  });

  // If the middleware returned a Rewrite, set the `url` to the pathname of the rewrite
  // NOTE: the header was added to `req` from above
  const rewriteUrl = responseHeaders.get("x-middleware-rewrite");
  let isExternalRewrite = false;
  let middlewareQuery = internalEvent.query;
  let newUrl = internalEvent.url;
  if (rewriteUrl) {
    newUrl = rewriteUrl;
    // If not a string, it should probably throw
    if (isExternal(newUrl, internalEvent.headers.host as string)) {
      isExternalRewrite = true;
    } else {
      const rewriteUrlObject = new URL(rewriteUrl);
      // Search params from the rewritten URL override the original search params

      middlewareQuery = getQueryFromSearchParams(rewriteUrlObject.searchParams);

      // We still need to add internal search params to the query string for pages router on older versions of Next.js
      if ("__nextDataReq" in internalEvent.query) {
        middlewareQuery.__nextDataReq = internalEvent.query.__nextDataReq;
      }
    }
  }

  // If the middleware wants to directly return a response (i.e. not using `NextResponse.next()` or `NextResponse.rewrite()`)
  // we return the response directly
  if (!rewriteUrl && !responseHeaders.get("x-middleware-next")) {
    // transfer response body to res
    const body = (result.body as ReadableStream) ?? emptyReadableStream();

    return {
      type: internalEvent.type,
      statusCode: statusCode,
      headers: resHeaders,
      body,
      isBase64Encoded: false,
    } satisfies InternalResult;
  }

  return {
    responseHeaders: resHeaders,
    url: newUrl,
    rawPath: new URL(newUrl).pathname,
    type: internalEvent.type,
    headers: { ...internalEvent.headers, ...reqHeaders },
    body: internalEvent.body,
    method: internalEvent.method,
    query: middlewareQuery,
    cookies: internalEvent.cookies,
    remoteAddress: internalEvent.remoteAddress,
    isExternalRewrite,
    rewriteStatusCode: statusCode,
  } satisfies MiddlewareEvent;
}
