import type { PluginHandler, Options } from "../next-types.js";

//#override imports
import path from "node:path";
import { IncomingMessage } from "../request.js";
import { ServerResponse } from "../response.js";
import { config, NEXT_DIR } from "../util.js";
import { requestHandler, getMiddlewareMatch, loadMiddlewareManifest } from "./util.js";

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
  options: Options
) => {
  const { internalEvent } = options;
  const { rawPath } = internalEvent;

  // Middleware
  const ended = await handleMiddleware(req, res, rawPath);
  if (ended) return;

  // Next Server
  return requestHandler(req, res);
};

// NOTE: As of Nextjs 13.4.13+, the middleware is handled outside the next-server.
// OpenNext will run the middleware in a sandbox and set the appropriate req headers
// and res.body prior to processing the next-server.
// @returns undefined | res.end()
//    if res.end() is return, the parent needs to return and not process next server
async function handleMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  rawPath: string
): Promise<ServerResponse | undefined> {
  const hasMatch = middleMatch.some((r) => r.test(rawPath));
  if (!hasMatch) return;

  // NOTE: Next middleware was originally developed to support nested middlewares
  // but that was discarded for simplicity. The MiddlewareInfo type still has the original
  // structure, but as of now, the only useful property on it is the "/" key (ie root).
  const middlewareInfo = middlewareManifest.middleware["/"];
  middlewareInfo.paths = middlewareInfo.files.map((file) => path.join(NEXT_DIR, file));

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
      url: `http://localhost:3000${rawPath}`, // internal host
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
      req.headers[key.substring(xMiddlewareKey.length)] = value;
    } else {
      req.headers[key] = value;
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
