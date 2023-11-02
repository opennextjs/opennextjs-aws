import { BuildId } from "../adapters/config";
import { InternalEvent, InternalResult } from "../adapters/event-mapper";
import {
  IncomingMessage,
  ResponseStream,
  ServerlessResponse,
} from "../adapters/http";
import { error } from "../adapters/logger";
import {
  postProcessResponse,
  processInternalEvent,
} from "../adapters/plugins/routing/default";
import { createServerResponse } from "../adapters/plugins/routing/util";
import { handler as serverHandler } from "../adapters/plugins/serverHandler";

export async function openNextHandler(
  internalEvent: InternalEvent,
  responseStreaming?: ResponseStream,
): Promise<InternalResult | void> {
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }
  const preprocessResult = await processInternalEvent(
    internalEvent,
    (method, headers) =>
      createServerResponse(
        internalEvent,
        {
          ...headers,
          "accept-encoding": internalEvent.headers["accept-encoding"],
        },
        responseStreaming,
      ),
  );

  if ("type" in preprocessResult) {
    return preprocessResult;
  } else {
    const {
      req,
      res,
      isExternalRewrite,
      internalEvent: overwrittenInternalEvent,
    } = preprocessResult;

    // @ts-ignore
    await processRequest(req, res, overwrittenInternalEvent, isExternalRewrite);

    const internalResult = await postProcessResponse({
      internalEvent: overwrittenInternalEvent,
      req,
      res,
      isExternalRewrite,
    });

    return internalResult;
  }
}

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
