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
    throw new Error("Warmer function are not supported with streaming");
  }
  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event);

  // WORKAROUND: Set `x-forwarded-host` header (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-x-forwarded-host-header-aws-specific
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }

  const createServerResponse = (
    method: string,
    headers: Record<string, string>,
  ) =>
    new StreamingServerResponse(
      { method, headers },
      responseStream,
      // We need to fix the cache header before sending any response
      async (headers) => {
        fixCacheHeaderForHtmlPages(internalEvent.rawPath, headers);
        fixSWRCacheHeader(headers);
        addOpenNextHeader(headers);
      },
    );

  const preprocessResult = await processInternalEvent(
    internalEvent,
    createServerResponse,
  );
  if ("type" in preprocessResult) {
    //TODO: replace this line
    const headers = preprocessResult.headers as Record<string, string>;
    console.log("headers", headers);
    const res = createServerResponse("GET", headers);
    // setImmediate(() => {
    //   console.log("preprocessResult.headers", headers);
    //   res.writeHead(preprocessResult.statusCode, headers);
    // });
    setImmediate(() => {
      res.writeHead(preprocessResult.statusCode, headers);
      res.write(preprocessResult.body);
      res.end();
    });
    // res.statusCode = preprocessResult.statusCode;
  } else {
    const {
      req,
      res,
      isExternalRewrite,
      internalEvent: overwrittenInternalEvent,
    } = preprocessResult;

    //@ts-expect-error - processRequest is already defined in serverHandler.ts
    await processRequest(req, res, overwrittenInternalEvent, isExternalRewrite);

    await revalidateIfRequired(
      internalEvent.headers.host,
      internalEvent.rawPath,
      res.headers,
      req,
    );
  }
});
//#endOverride
