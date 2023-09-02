/* eslint-disable simple-import-sort/imports */
import type { PostProcessOptions, ProcessInternalEventResult } from "./types";
import type { InternalEvent, InternalResult } from "../../event-mapper";
//#override imports
import { debug } from "../../logger";
import { IncomingMessage } from "../../request";
import { ServerResponse } from "../../response";
import {
  addOpenNextHeader,
  fixCacheHeaderForHtmlPages,
  fixSWRCacheHeader,
  revalidateIfRequired,
} from "./util";
import { convertRes } from "../../routing/util";
//#endOverride

//#override processInternalEvent
export async function processInternalEvent(
  internalEvent: InternalEvent,
): Promise<ProcessInternalEventResult> {
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
  const res = new ServerResponse({ method: reqProps.method, headers: {} });
  return { internalEvent, req, res, isExternalRewrite: false };
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
