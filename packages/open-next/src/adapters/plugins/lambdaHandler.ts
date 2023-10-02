import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";

import { BuildId, PublicAssets } from "../config";
import { convertFrom, convertTo, InternalEvent } from "../event-mapper";
import { type IncomingMessage, ServerlessResponse } from "../http";
import { debug, error } from "../logger";
import { CreateResponse } from "../types/plugin";
import { generateUniqueId } from "../util";
import { WarmerEvent, WarmerResponse } from "../warmer-function";
//#override imports
import {
  postProcessResponse,
  processInternalEvent,
} from "./routing/default.js";
//#endOverride
import { handler as serverHandler } from "./serverHandler";

const serverId = `server-${generateUniqueId()}`;

//#override lambdaHandler
export async function lambdaHandler(
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent,
) {
  debug("event", event);
  // Handler warmer
  if ("type" in event) {
    return formatWarmerResponse(event);
  }

  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event);

  // WORKAROUND: Set `x-forwarded-host` header (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-x-forwarded-host-header-aws-specific
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }

  // WORKAROUND: public/ static files served by the server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-public-static-files-served-by-the-server-function-aws-specific
  // TODO: This is no longer required if each top-level file and folder in "/public"
  //       is handled by a separate cache behavior. Leaving here for backward compatibility.
  //       Remove this on next major release.
  if (PublicAssets.files.includes(internalEvent.rawPath)) {
    return internalEvent.type === "cf"
      ? formatCloudFrontFailoverResponse(event as CloudFrontRequestEvent)
      : formatAPIGatewayFailoverResponse();
  }

  const createServerResponse: CreateResponse<ServerlessResponse> = (
    method,
    headers,
  ) => new ServerlessResponse({ method, headers });

  const preprocessResult = await processInternalEvent(
    internalEvent,
    createServerResponse,
  );
  if ("type" in preprocessResult) {
    return convertTo(preprocessResult);
  } else {
    const {
      req,
      res,
      isExternalRewrite,
      internalEvent: overwrittenInternalEvent,
    } = preprocessResult;

    await processRequest(req, res, overwrittenInternalEvent, isExternalRewrite);

    const internalResult = await postProcessResponse({
      internalEvent: overwrittenInternalEvent,
      req,
      res,
      isExternalRewrite,
    });

    return convertTo(internalResult);
  }
}
//#endOverride

async function processRequest(
  req: IncomingMessage,
  res: ServerlessResponse,
  internalEvent: InternalEvent,
  isExternalRewrite?: boolean,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    // `serverHandler` is replaced at build time depending on user's
    // nextjs version to patch Nextjs 13.4.x and future breaking changes.
    await serverHandler(req, res, {
      internalEvent,
      buildId: BuildId,
      isExternalRewrite,
    });
  } catch (e: any) {
    error("NextJS request failed.", e);

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          message: "Server failed to respond.",
          details: e,
        },
        null,
        2,
      ),
    );
  }
}

function formatAPIGatewayFailoverResponse() {
  return { statusCode: 503 };
}

function formatCloudFrontFailoverResponse(event: CloudFrontRequestEvent) {
  return event.Records[0].cf.request;
}

function formatWarmerResponse(event: WarmerEvent) {
  return new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId } satisfies WarmerResponse);
    }, event.delay);
  });
}
