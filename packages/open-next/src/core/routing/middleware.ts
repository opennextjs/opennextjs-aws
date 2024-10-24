import { ReadableStream } from "node:stream/web";

import { MiddlewareManifest, NextConfig } from "config/index.js";
import { InternalEvent, InternalResult } from "types/open-next.js";
import { emptyReadableStream } from "utils/stream.js";

import { localizePath } from "./i18n/index.js";
//NOTE: we should try to avoid importing stuff from next as much as possible
// every release of next could break this
// const { run } = require("next/dist/server/web/sandbox");
// const { getCloneableBody } = require("next/dist/server/body-streams");
// const {
//   signalFromNodeResponse,
// } = require("next/dist/server/web/spec-extension/adapters/next-request");
import {
  convertBodyToReadableStream,
  convertToQueryString,
  getMiddlewareMatch,
  isExternal,
} from "./util.js";

const middlewareManifest = MiddlewareManifest;

const middleMatch = getMiddlewareMatch(middlewareManifest);

type MiddlewareOutputEvent = InternalEvent & {
  responseHeaders?: Record<string, string | string[]>;
  externalRewrite?: boolean;
};

type Middleware = (request: Request) => Response | Promise<Response>;
type MiddlewareLoader = () => Promise<{ default: Middleware }>;

function defaultMiddlewareLoader() {
  // @ts-expect-error - This is bundled
  return import("./middleware.mjs");
}

// NOTE: As of Nextjs 13.4.13+, the middleware is handled outside the next-server.
// OpenNext will run the middleware in a sandbox and set the appropriate req headers
// and res.body prior to processing the next-server.
// @returns undefined | res.end()

//    if res.end() is return, the parent needs to return and not process next server
export async function handleMiddleware(
  internalEvent: InternalEvent,
  middlewareLoader: MiddlewareLoader = defaultMiddlewareLoader,
): Promise<MiddlewareOutputEvent | InternalResult> {
  const { query } = internalEvent;
  const normalizedPath = localizePath(internalEvent);
  // We only need the normalizedPath to check if the middleware should run
  const hasMatch = middleMatch.some((r) => r.test(normalizedPath));
  if (!hasMatch) return internalEvent;
  // We bypass the middleware if the request is internal
  if (internalEvent.headers["x-isr"]) return internalEvent;

  const host = internalEvent.headers.host
    ? `https://${internalEvent.headers.host}`
    : "http://localhost:3000";
  const initialUrl = new URL(normalizedPath, host);
  initialUrl.search = convertToQueryString(query);
  const url = initialUrl.toString();
  // console.log("url", url, normalizedPath);

  const middleware = await middlewareLoader();

  const result: Response = await middleware.default({
    geo: {
      city: internalEvent.headers["x-open-next-city"],
      country: internalEvent.headers["x-open-next-country"],
      region: internalEvent.headers["x-open-next-region"],
      latitude: internalEvent.headers["x-open-next-latitude"],
      longitude: internalEvent.headers["x-open-next-longitude"],
    },
    headers: internalEvent.headers,
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

  responseHeaders.delete("x-middleware-override-headers");
  const xMiddlewareKey = "x-middleware-request-";
  responseHeaders.forEach((value, key) => {
    if (key.startsWith(xMiddlewareKey)) {
      const k = key.substring(xMiddlewareKey.length);
      reqHeaders[k] = value;
    } else {
      if (key.toLowerCase() === "set-cookie") {
        resHeaders[key] = resHeaders[key]
          ? [...resHeaders[key], value]
          : [value];
      } else {
        resHeaders[key] = value;
      }
    }
  });

  // If the middleware returned a Redirect, we set the `Location` header with
  // the redirected url and end the response.
  if (statusCode >= 300 && statusCode < 400) {
    resHeaders.location =
      responseHeaders
        .get("location")
        ?.replace(
          "http://localhost:3000",
          `https://${internalEvent.headers.host}`,
        ) ?? resHeaders.location;
    // res.setHeader("Location", location);
    return {
      body: emptyReadableStream(),
      type: internalEvent.type,
      statusCode: statusCode,
      headers: resHeaders,
      isBase64Encoded: false,
    };
  }

  // If the middleware returned a Rewrite, set the `url` to the pathname of the rewrite
  // NOTE: the header was added to `req` from above
  const rewriteUrl = responseHeaders.get("x-middleware-rewrite");
  let rewritten = false;
  let externalRewrite = false;
  let middlewareQueryString = internalEvent.query;
  let newUrl = internalEvent.url;
  if (rewriteUrl) {
    // If not a string, it should probably throw
    if (isExternal(rewriteUrl, internalEvent.headers.host as string)) {
      newUrl = rewriteUrl;
      rewritten = true;
      externalRewrite = true;
    } else {
      const rewriteUrlObject = new URL(rewriteUrl);
      newUrl = rewriteUrlObject.pathname;

      // Reset the query params if the middleware is a rewrite
      if (middlewareQueryString["__nextDataReq"]) {
        middlewareQueryString = {
          __nextDataReq: middlewareQueryString["__nextDataReq"],
        };
      } else {
        middlewareQueryString = {};
      }

      rewriteUrlObject.searchParams.forEach((v: string, k: string) => {
        middlewareQueryString[k] = v;
      });
      rewritten = true;
    }
  }

  // If the middleware returned a `NextResponse`, pipe the body to res. This will return
  // the body immediately to the client.
  if (result.body) {
    // transfer response body to res
    const body = result.body as ReadableStream<Uint8Array>;

    // await pipeReadable(result.response.body, res);
    return {
      type: internalEvent.type,
      statusCode: statusCode,
      headers: resHeaders,
      body,
      isBase64Encoded: false,
    };
  }

  return {
    responseHeaders: resHeaders,
    url: newUrl,
    rawPath: rewritten
      ? (newUrl ?? internalEvent.rawPath)
      : internalEvent.rawPath,
    type: internalEvent.type,
    headers: { ...internalEvent.headers, ...reqHeaders },
    body: internalEvent.body,
    method: internalEvent.method,
    query: middlewareQueryString,
    cookies: internalEvent.cookies,
    remoteAddress: internalEvent.remoteAddress,
    externalRewrite,
  };
}
