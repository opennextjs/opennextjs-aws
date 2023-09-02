/* eslint-disable simple-import-sort/imports */
import type { PostProcessOptions, ProcessInternalEventResult } from "./types";
import type { InternalEvent, InternalResult } from "../../event-mapper";
//#override imports
import path from "node:path";

import { debug } from "../../logger";
import { IncomingMessage } from "../../request";
import { ServerResponse } from "../../response";
import {
  addNextConfigHeaders,
  fixDataPage,
  handleRedirects,
  handleRewrites,
} from "../../routing/matcher";
import { loadBuildId, loadConfigHeaders, loadRoutesManifest } from "../../util";
import {
  addOpenNextHeader,
  fixCacheHeaderForHtmlPages,
  fixSWRCacheHeader,
  revalidateIfRequired,
} from "./util";
import { convertRes } from "../../routing/util";
import { handleMiddleware } from "../../routing/middleware";

const NEXT_DIR = path.join(__dirname, ".next");
const buildId = loadBuildId(NEXT_DIR);
const routesManifest = loadRoutesManifest(NEXT_DIR);
const configHeaders = loadConfigHeaders(NEXT_DIR);
//#endOverride

//#override processInternalEvent
export async function processInternalEvent(
  event: InternalEvent,
): Promise<ProcessInternalEventResult> {
  const nextHeaders = addNextConfigHeaders(event, configHeaders) ?? {};
  debug("nextHeaders", nextHeaders);

  let internalEvent = fixDataPage(event, buildId);

  const redirect = handleRedirects(internalEvent, routesManifest.redirects);
  if (redirect) {
    return redirect;
  }

  const middleware = await handleMiddleware(internalEvent);
  let middlewareResponseHeaders: Record<string, string | string[]> = {};
  if ("statusCode" in middleware) {
    return middleware;
  } else {
    middlewareResponseHeaders = middleware.responseHeaders || {};
    internalEvent = middleware;
  }

  let isExternalRewrite = false;
  // First rewrite to be applied
  const beforeRewrites = handleRewrites(
    internalEvent,
    routesManifest.rewrites.beforeFiles,
  );
  internalEvent = beforeRewrites.internalEvent;
  isExternalRewrite = beforeRewrites.isExternalRewrite;

  const isStaticRoute = routesManifest.routes.static.some((route) =>
    new RegExp(route.regex).test(event.rawPath),
  );

  if (!isStaticRoute && !isExternalRewrite) {
    // Second rewrite to be applied
    const afterRewrites = handleRewrites(
      internalEvent,
      routesManifest.rewrites.afterFiles,
    );
    internalEvent = afterRewrites.internalEvent;
    isExternalRewrite = afterRewrites.isExternalRewrite;
  }

  const isDynamicRoute = routesManifest.routes.dynamic.some((route) =>
    new RegExp(route.regex).test(event.rawPath),
  );
  if (!isDynamicRoute && !isStaticRoute && !isExternalRewrite) {
    // Fallback rewrite to be applied
    const fallbackRewrites = handleRewrites(
      internalEvent,
      routesManifest.rewrites.fallback,
    );
    internalEvent = fallbackRewrites.internalEvent;
    isExternalRewrite = fallbackRewrites.isExternalRewrite;
  }

  const reqProps = {
    method: internalEvent.method,
    url: internalEvent.url,
    //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
    // There is 3 way we can handle revalidation:
    // 1. We could just let the revalidation go as normal, but due to race condtions the revalidation will be unreliable
    // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
    // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
    headers: { ...internalEvent.headers, purpose: "prefetch" },
    body: internalEvent.body,
    remoteAddress: internalEvent.remoteAddress,
  };
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({
    method: reqProps.method,
    // Next headers should be added first in case middleware modifies headers
    headers: {
      ...nextHeaders,
      ...middlewareResponseHeaders,
    },
  });

  return { internalEvent: internalEvent, req, res, isExternalRewrite };
}
//#endOverride

//#override postProcessResponse
export async function postProcessResponse({
  internalEvent,
  req,
  res,
  isExternalRewrite,
}: PostProcessOptions): Promise<InternalResult> {
  const { statusCode, headers, isBase64Encoded, body } = convertRes(res);

  debug("ServerResponse data", { statusCode, headers, isBase64Encoded, body });

  if (!isExternalRewrite) {
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
