import path from "node:path";

import { InternalEvent, InternalResult } from "../event-mapper.js";
import { IncomingMessage } from "../request.js";
import { ServerResponse } from "../response.js";
import { loadConfig } from "../util.js";
import {
  convertRes,
  getMiddlewareMatch,
  loadMiddlewareManifest,
} from "./util.js";

const NEXT_DIR = path.join(__dirname, ".next");

const config = loadConfig(NEXT_DIR);

const middlewareManifest = loadMiddlewareManifest(NEXT_DIR);

const { run } = require("next/dist/server/web/sandbox");
const { pipeReadable } = require("next/dist/server/pipe-readable");
const { getCloneableBody } = require("next/dist/server/body-streams");
const {
  signalFromNodeResponse,
} = require("next/dist/server/web/spec-extension/adapters/next-request");

const middleMatch = getMiddlewareMatch(middlewareManifest);

type MiddlewareOutputEvent = InternalEvent & {
  responseHeaders?: Record<string, string | string[]>;
};

// NOTE: As of Nextjs 13.4.13+, the middleware is handled outside the next-server.
// OpenNext will run the middleware in a sandbox and set the appropriate req headers
// and res.body prior to processing the next-server.
// @returns undefined | res.end()

//    if res.end() is return, the parent needs to return and not process next server
export async function handleMiddleware(
  internalEvent: InternalEvent,
): Promise<MiddlewareOutputEvent | InternalResult> {
  const { rawPath, query } = internalEvent;
  const hasMatch = middleMatch.some((r) => r.test(rawPath));
  if (!hasMatch) return internalEvent;

  const req = new IncomingMessage(internalEvent);
  const res = new ServerResponse({ method: req.method, headers: {} });

  // NOTE: Next middleware was originally developed to support nested middlewares
  // but that was discarded for simplicity. The MiddlewareInfo type still has the original
  // structure, but as of now, the only useful property on it is the "/" key (ie root).
  const middlewareInfo = middlewareManifest.middleware["/"];
  middlewareInfo.paths = middlewareInfo.files.map((file) =>
    path.join(NEXT_DIR, file),
  );

  const urlQuery: Record<string, string> = {};
  Object.keys(query).forEach((k) => {
    const v = query[k];
    urlQuery[k] = Array.isArray(v) ? v.join(",") : v;
  });

  const host = req.headers.host
    ? `https://${req.headers.host}`
    : "http://localhost:3000";
  const initialUrl = new URL(rawPath, host);
  initialUrl.search = new URLSearchParams(urlQuery).toString();
  const url = initialUrl.toString();

  const result = await run({
    distDir: NEXT_DIR,
    name: middlewareInfo.name || "/",
    paths: middlewareInfo.paths || [],
    edgeFunctionEntry: middlewareInfo,
    request: {
      headers: req.headers,
      method: req.method || "GET",
      nextConfig: {
        basePath: config.basePath,
        i18n: config.i18n,
        trailingSlash: config.trailingSlash,
      },
      url,
      body: getCloneableBody(req),
      signal: signalFromNodeResponse(res),
    },
    useCache: true,
    onWarning: console.warn,
  });
  res.statusCode = result.response.status;
  // If the middleware returned a Redirect, we set the `Location` header with
  // the redirected url and end the response.
  if (res.statusCode >= 300 && res.statusCode < 400) {
    const location = result.response.headers
      .get("location")
      ?.replace("http://localhost:3000", `https://${req.headers.host}`);
    // res.setHeader("Location", location);
    return {
      body: "",
      type: internalEvent.type,
      statusCode: res.statusCode,
      headers: {
        Location: location,
      },
      isBase64Encoded: false,
    };
  }

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
  const responseHeaders = result.response.headers as Headers;
  const reqHeaders: Record<string, string> = {};
  const resHeaders: Record<string, string> = {};

  responseHeaders.delete("x-middleware-override-headers");
  const xMiddlewareKey = "x-middleware-request-";
  responseHeaders.forEach((value, key) => {
    if (key.startsWith(xMiddlewareKey)) {
      const k = key.substring(xMiddlewareKey.length);
      reqHeaders[k] = value;
      req.headers[k] = value;
    } else {
      resHeaders[key] = value;
      res.setHeader(key, value);
    }
  });

  // If the middleware returned a Rewrite, set the `url` to the pathname of the rewrite
  // NOTE: the header was added to `req` from above
  const rewriteUrl = responseHeaders.get("x-middleware-rewrite");
  let rewritten = false;
  if (rewriteUrl) {
    req.url = new URL(rewriteUrl).pathname;
    rewritten = true;
  }

  // If the middleware returned a `NextResponse`, pipe the body to res. This will return
  // the body immediately to the client.
  if (result.response.body) {
    await pipeReadable(result.response.body, res);
    return {
      type: internalEvent.type,
      ...convertRes(res),
    };
  }

  return {
    responseHeaders: resHeaders,
    url: req.url ?? internalEvent.url,
    rawPath: rewritten
      ? req.url ?? internalEvent.rawPath
      : internalEvent.rawPath,
    type: internalEvent.type,
    headers: { ...internalEvent.headers, ...reqHeaders },
    body: internalEvent.body,
    method: internalEvent.method,
    query: internalEvent.query,
    cookies: internalEvent.cookies,
    remoteAddress: internalEvent.remoteAddress,
  };
}
