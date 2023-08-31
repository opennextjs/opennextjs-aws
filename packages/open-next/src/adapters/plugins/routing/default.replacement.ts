//#override imports
import path from "node:path";

import { isBinaryContentType } from "../../binary";
import { InternalEvent, InternalResult } from "../../event-mapper";
import { debug } from "../../logger";
import { IncomingMessage } from "../../request";
import { ServerResponse } from "../../response";
import { loadConfigHeaders, loadRoutesManifest } from "../../util";
import type { PostProcessOptions, ProcessInternalEventResult } from "./types";
import {
  addNextConfigHeaders,
  addOpenNextHeader,
  fixCacheHeaderForHtmlPages,
  fixSWRCacheHeader,
  handleRedirects,
  handleRewrites,
  revalidateIfRequired,
} from "./util";

const NEXT_DIR = path.join(__dirname, ".next");
const routesManifest = loadRoutesManifest(NEXT_DIR);
const configHeaders = loadConfigHeaders(NEXT_DIR);
//#endOverride

//#override processInternalEvent
export function processInternalEvent(
  internalEvent: InternalEvent,
  //@ts-expect-error - This is a hack to get around the fact that we are not using the correct types for the response
): ProcessInternalEventResult<IncomingMessage, ServerResponse> {
  addNextConfigHeaders(internalEvent.url, internalEvent.headers, configHeaders);

  let _internalEvent = internalEvent;

  const redirect = handleRedirects(_internalEvent, routesManifest.redirects);
  if (redirect) {
    return redirect;
  }

  let isExternalRewrite = false;
  // First rewrite to be applied
  const beforeRewrites = handleRewrites(
    _internalEvent,
    routesManifest.rewrites.beforeFiles,
  );
  _internalEvent = beforeRewrites.internalEvent;
  isExternalRewrite = beforeRewrites.isExternalRewrite;

  const isStaticRoute = routesManifest.routes.static.some((route) =>
    new RegExp(route.regex).test(internalEvent.rawPath),
  );

  if (!isStaticRoute && !isExternalRewrite) {
    // Second rewrite to be applied
    const afterRewrites = handleRewrites(
      _internalEvent,
      routesManifest.rewrites.afterFiles,
    );
    _internalEvent = afterRewrites.internalEvent;
    isExternalRewrite = afterRewrites.isExternalRewrite;
  }

  const isDynamicRoute = routesManifest.routes.dynamic.some((route) =>
    new RegExp(route.regex).test(internalEvent.rawPath),
  );
  if (!isDynamicRoute && !isStaticRoute && !isExternalRewrite) {
    // Fallback rewrite to be applied
    const fallbackRewrites = handleRewrites(
      _internalEvent,
      routesManifest.rewrites.fallback,
    );
    _internalEvent = fallbackRewrites.internalEvent;
    isExternalRewrite = fallbackRewrites.isExternalRewrite;
  }

  const reqProps = {
    method: _internalEvent.method,
    url: _internalEvent.url,
    //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
    // There is 3 way we can handle revalidation:
    // 1. We could just let the revalidation go as normal, but due to race condtions the revalidation will be unreliable
    // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
    // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
    headers: { ..._internalEvent.headers, purpose: "prefetch" },
    body: _internalEvent.body,
    remoteAddress: _internalEvent.remoteAddress,
  };
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  return { internalEvent: _internalEvent, req, res, isExternalRewrite };
}
//#endOverride

//#override postProcessResponse
export async function postProcessResponse({
  internalEvent,
  req,
  res,
  isExternalRewrite,
}: PostProcessOptions): Promise<InternalResult> {
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

  if (!isExternalRewrite) {
    // Load the headers in next.config.js to the response.
    addNextConfigHeaders(internalEvent.url, headers);
    fixCacheHeaderForHtmlPages(internalEvent.rawPath, headers);
    fixSWRCacheHeader(headers);
    addOpenNextHeader(headers);

    await revalidateIfRequired(
      internalEvent.headers.host,
      internalEvent.rawPath,
      headers,
      req,
    );
  }

  return {
    type: internalEvent.type,
    statusCode,
    headers,
    body,
    isBase64Encoded,
  };
}
//#endOverride
