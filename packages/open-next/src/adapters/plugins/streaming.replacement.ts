/*eslint-disable simple-import-sort/imports */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";

import { convertFrom } from "../event-mapper";
import { debug } from "../logger";
import type { ResponseStream } from "../types/aws-lambda";
import type { WarmerEvent } from "../warmer-function";
//#override imports
import { StreamingServerResponse } from "../http/responseStreaming";
import { processInternalEvent } from "./routing/default.js";
import {
  addOpenNextHeader,
  fixCacheHeaderForHtmlPages,
  fixSWRCacheHeader,
  revalidateIfRequired,
} from "./routing/util";
import { CreateResponse } from "../types/plugin";
//#endOverride

//#override lambdaHandler
export const lambdaHandler = awslambda.streamifyResponse(async function (
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent,
  responseStream: ResponseStream,
) {
  debug("event", event);

  // Handler warmer
  if ("type" in event) {
    // @ts-ignore formatWarmerResponse defined in lambdaHandler
    const result = await formatWarmerResponse(event);
    responseStream.end(Buffer.from(JSON.stringify(result)), "utf-8");
    return;
  }
  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event);

  // WORKAROUND: Set `x-forwarded-host` header (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-x-forwarded-host-header-aws-specific
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }

  const createServerResponse: CreateResponse<StreamingServerResponse> = (
    method: string,
    headers: Record<string, string | string[] | undefined>,
  ) => {
    // sets the accept-encoding for responseStreaming.ts to set "content-encoding"
    headers["accept-encoding"] = internalEvent.headers["accept-encoding"];
    return new StreamingServerResponse({
      method,
      headers,
      responseStream,
      // We need to fix the cache header before sending any response
      fixHeaders: (headers) => {
        fixCacheHeaderForHtmlPages(internalEvent.rawPath, headers);
        fixSWRCacheHeader(headers);
        addOpenNextHeader(headers);
        // fixISRHeaders(headers);
      },
      // This run in the callback of the response stream end
      onEnd: async (headers) => {
        await revalidateIfRequired(
          internalEvent.headers.host,
          internalEvent.rawPath,
          headers,
        );
      },
    });
  };

  const preprocessResult = await processInternalEvent(
    internalEvent,
    createServerResponse,
  );
  if ("type" in preprocessResult) {
    const headers = preprocessResult.headers;
    const res = createServerResponse("GET", headers);

    setImmediate(() => {
      res.writeHead(preprocessResult.statusCode, headers);
      res.write(preprocessResult.body);
      res.end();
    });
  } else {
    const {
      req,
      res,
      isExternalRewrite,
      internalEvent: overwrittenInternalEvent,
    } = preprocessResult;

    //@ts-expect-error - processRequest is already defined in serverHandler.ts
    await processRequest(req, res, overwrittenInternalEvent, isExternalRewrite);
  }
});
//#endOverride
