import { AsyncLocalStorage } from "node:async_hooks";

import {
  IncomingMessage,
  OpenNextNodeResponse,
  StreamCreator,
} from "http/index.js";
import { InternalEvent, InternalResult } from "types/open-next";
import { DetachedPromiseRunner } from "utils/promise";

import { debug, error, warn } from "../adapters/logger";
import { patchAsyncStorage } from "./patchAsyncStorage";
import { convertRes, createServerResponse, proxyRequest } from "./routing/util";
import routingHandler, { MiddlewareOutputEvent } from "./routingHandler";
import { requestHandler, setNextjsPrebundledReact } from "./util";

// This is used to identify requests in the cache
globalThis.__als = new AsyncLocalStorage<{
  requestId: string;
  pendingPromiseRunner: DetachedPromiseRunner;
  isISRRevalidation?: boolean;
}>();

patchAsyncStorage();

export async function openNextHandler(
  internalEvent: InternalEvent,
  responseStreaming?: StreamCreator,
): Promise<InternalResult> {
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }
  debug("internalEvent", internalEvent);

  //#override withRouting
  let preprocessResult: InternalResult | MiddlewareOutputEvent = {
    internalEvent: internalEvent,
    isExternalRewrite: false,
    origin: false,
    isISR: false,
  };
  try {
    preprocessResult = await routingHandler(internalEvent);
  } catch (e) {
    warn("Routing failed.", e);
  }
  //#endOverride

  const headers =
    "type" in preprocessResult
      ? preprocessResult.headers
      : preprocessResult.internalEvent.headers;

  const overwrittenResponseHeaders = Object.entries(
    "type" in preprocessResult
      ? preprocessResult.headers
      : preprocessResult.internalEvent.headers,
  ).reduce((acc, [key, value]) => {
    if (!key.startsWith("x-middleware-response-")) {
      return acc;
    } else {
      const newKey = key.replace("x-middleware-response-", "");
      delete headers[key];
      headers[newKey] = value;
      return { ...acc, [newKey]: value };
    }
  }, {});

  if ("type" in preprocessResult) {
    // // res is used only in the streaming case
    if (responseStreaming) {
      const res = createServerResponse(
        internalEvent,
        headers,
        responseStreaming,
      );
      res.statusCode = preprocessResult.statusCode;
      res.flushHeaders();
      const [bodyToConsume, bodyToReturn] = preprocessResult.body.tee();
      for await (const chunk of bodyToConsume) {
        res.write(chunk);
      }
      res.end();
      preprocessResult.body = bodyToReturn;
    }
    return preprocessResult;
  } else {
    const preprocessedEvent = preprocessResult.internalEvent;
    debug("preprocessedEvent", preprocessedEvent);
    const reqProps = {
      method: preprocessedEvent.method,
      url: preprocessedEvent.url,
      //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
      // There is 3 way we can handle revalidation:
      // 1. We could just let the revalidation go as normal, but due to race condtions the revalidation will be unreliable
      // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
      // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
      headers: { ...headers, purpose: "prefetch" },
      body: preprocessedEvent.body,
      remoteAddress: preprocessedEvent.remoteAddress,
    };
    const requestId = Math.random().toString(36);
    const pendingPromiseRunner: DetachedPromiseRunner =
      new DetachedPromiseRunner();
    const isISRRevalidation = headers["x-isr"] === "1";
    const internalResult = await globalThis.__als.run(
      { requestId, pendingPromiseRunner, isISRRevalidation },
      async () => {
        const preprocessedResult = preprocessResult as MiddlewareOutputEvent;
        const req = new IncomingMessage(reqProps);
        const res = createServerResponse(
          preprocessedEvent,
          overwrittenResponseHeaders,
          responseStreaming,
        );

        await processRequest(
          req,
          res,
          preprocessedEvent,
          preprocessedResult.isExternalRewrite,
        );

        const { statusCode, headers, isBase64Encoded, body } = convertRes(res);

        const internalResult = {
          type: internalEvent.type,
          statusCode,
          headers,
          body,
          isBase64Encoded,
        };

        // reset lastModified. We need to do this to avoid memory leaks
        delete globalThis.lastModified[requestId];

        await pendingPromiseRunner.await();

        return internalResult;
      },
    );
    return internalResult;
  }
}

async function processRequest(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
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

    const { rawPath } = internalEvent;

    if (isExternalRewrite) {
      return proxyRequest(internalEvent, res);
    } else {
      //#override applyNextjsPrebundledReact
      setNextjsPrebundledReact(rawPath);
      //#endOverride

      // Next Server
      await requestHandler(req, res);
    }
  } catch (e: any) {
    // This might fail when using bundled next, importing won't do the trick either
    if (e.constructor.name === "NoFallbackError") {
      // Do we need to handle _not-found
      // Ideally this should never get triggered and be intercepted by the routing handler
      await tryRenderError("404", res, internalEvent);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, internalEvent);
    }
  }
}

async function tryRenderError(
  type: "404" | "500",
  res: OpenNextNodeResponse,
  internalEvent: InternalEvent,
) {
  try {
    const _req = new IncomingMessage({
      method: "GET",
      url: `/${type}`,
      headers: internalEvent.headers,
      body: internalEvent.body,
      remoteAddress: internalEvent.remoteAddress,
    });
    await requestHandler(_req, res);
  } catch (e) {
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
