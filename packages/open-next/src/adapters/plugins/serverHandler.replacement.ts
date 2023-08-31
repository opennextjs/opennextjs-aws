//#override imports
import path from "node:path";

import { InternalEvent } from "../event-mapper.js";
import type { Options, PluginHandler } from "../next-types.js";
import { IncomingMessage } from "../request.js";
import { ServerResponse } from "../response.js";
import { loadConfig } from "../util.js";
import { proxyRequest } from "./routing/util.js";
import {
  getMiddlewareMatch,
  loadMiddlewareManifest,
  requestHandler,
  setNextjsPrebundledReact,
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
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: Options,
) => {
  let { internalEvent } = options;

  const { rawPath } = internalEvent;

  // Middleware
  // TODO: handle external rewrites in middleware
  const ended = await handleMiddleware(req, res, internalEvent);
  if (ended) return;
  if (options.isExternalRewrite) {
    return proxyRequest(req, res);
  } else {
    setNextjsPrebundledReact(rawPath);
    // Next Server
    return requestHandler(req, res);
  }
};

// NOTE: As of Nextjs 13.4.13+, the middleware is handled outside the next-server.
// OpenNext will run the middleware in a sandbox and set the appropriate req headers
// and res.body prior to processing the next-server.
// @returns undefined | res.end()
//    if res.end() is return, the parent needs to return and not process next server
async function handleMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  internalEvent: InternalEvent,
): Promise<ServerResponse | undefined> {
  const { rawPath, query } = internalEvent;
  const hasMatch = middleMatch.some((r) => r.test(rawPath));
  if (!hasMatch) return;

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

  const search = new URLSearchParams(urlQuery).toString();
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
      url: `http://localhost:3000${rawPath}?${search || ""}`, // internal host
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
    res.setHeader("Location", location);
    return res.end();
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

  responseHeaders.delete("x-middleware-override-headers");
  const xMiddlewareKey = "x-middleware-request-";
  responseHeaders.forEach((value, key) => {
    if (key.startsWith(xMiddlewareKey)) {
      const k = key.substring(xMiddlewareKey.length);
      res.headers[k] = req.headers[k] = value;
    } else {
      res.headers[key] = req.headers[key] = value;
    }
  });

  // If the middleware returned a Rewrite, set the `url` to the pathname of the rewrite
  // NOTE: the header was added to `req` from above
  const rewriteUrl = req.headers["x-middleware-rewrite"] as string;
  if (rewriteUrl) {
    req.url = new URL(rewriteUrl).pathname;
  }

  // If the middleware returned a `NextResponse`, pipe the body to res. This will return
  // the body immediately to the client.
  if (result.response.body) {
    await pipeReadable(result.response.body, res);
    return res.end();
  }
}
//#endOverride
