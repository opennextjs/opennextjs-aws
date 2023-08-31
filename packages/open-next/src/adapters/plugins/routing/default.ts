/* eslint-disable simple-import-sort/imports */
import type { PostProcessOptions, ProcessInternalEventResult } from "./types";
//#override imports
import { isBinaryContentType } from "../../binary";
import { InternalEvent, InternalResult } from "../../event-mapper";
import { debug } from "../../logger";
import { IncomingMessage } from "../../request";
import { ServerResponse } from "../../response";
import {
  // addNextConfigHeaders,
  addOpenNextHeader,
  fixCacheHeaderForHtmlPages,
  fixSWRCacheHeader,
  revalidateIfRequired,
} from "./util";
//#endOverride

//#override processInternalEvent
export function processInternalEvent(
  internalEvent: InternalEvent,
  //@ts-expect-error - This is a hack to get around the fact that we are not using the correct types for the response
): ProcessInternalEventResult<IncomingMessage, ServerResponse> {
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
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  return { internalEvent, req, res };
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
    // addNextConfigHeaders(internalEvent.url, headers);
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
