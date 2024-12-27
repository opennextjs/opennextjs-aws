import { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextNodeResponse } from "http/index.js";
import { IncomingMessage } from "http/index.js";
import type {
  InternalEvent,
  InternalResult,
  ResolvedRoute,
  RoutingResult,
  StreamCreator,
} from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";

import { debug, error, warn } from "../adapters/logger";
import { patchAsyncStorage } from "./patchAsyncStorage";
import { convertRes, createServerResponse } from "./routing/util";
import routingHandler, {
  INTERNAL_HEADER_INITIAL_PATH,
  INTERNAL_HEADER_RESOLVED_ROUTES,
  MIDDLEWARE_HEADER_PREFIX,
  MIDDLEWARE_HEADER_PREFIX_LEN,
} from "./routingHandler";
import { requestHandler, setNextjsPrebundledReact } from "./util";

// This is used to identify requests in the cache
globalThis.__openNextAls = new AsyncLocalStorage();

patchAsyncStorage();

export async function openNextHandler(
  internalEvent: InternalEvent,
  responseStreaming?: StreamCreator,
): Promise<InternalResult> {
  const initialHeaders = internalEvent.headers;
  // We run everything in the async local storage context so that it is available in the middleware as well as in NextServer
  return runWithOpenNextRequestContext(
    { isISRRevalidation: initialHeaders["x-isr"] === "1" },
    async () => {
      if (initialHeaders["x-forwarded-host"]) {
        initialHeaders.host = initialHeaders["x-forwarded-host"];
      }
      debug("internalEvent", internalEvent);

      // These 2 will get overwritten by the routing handler if not using an external middleware
      const internalHeaders = {
        initialPath:
          initialHeaders[INTERNAL_HEADER_INITIAL_PATH] ?? internalEvent.rawPath,
        resolvedRoutes: initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES]
          ? JSON.parse(initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES])
          : ([] as ResolvedRoute[]),
      };

      let routingResult: InternalResult | RoutingResult = {
        internalEvent,
        isExternalRewrite: false,
        origin: false,
        isISR: false,
        ...internalHeaders,
      };

      //#override withRouting
      try {
        routingResult = await routingHandler(internalEvent);
      } catch (e) {
        warn("Routing failed.", e);
      }
      //#endOverride

      const headers =
        "type" in routingResult
          ? routingResult.headers
          : routingResult.internalEvent.headers;

      const overwrittenResponseHeaders: Record<string, string | string[]> = {};

      for (const [rawKey, value] of Object.entries(headers)) {
        if (!rawKey.startsWith(MIDDLEWARE_HEADER_PREFIX)) {
          continue;
        }
        const key = rawKey.slice(MIDDLEWARE_HEADER_PREFIX_LEN);
        overwrittenResponseHeaders[key] = value;
        headers[key] = value;
        delete headers[rawKey];
      }

      if (
        "isExternalRewrite" in routingResult &&
        routingResult.isExternalRewrite === true
      ) {
        try {
          routingResult = await globalThis.proxyExternalRequest.proxy(
            routingResult.internalEvent,
          );
        } catch (e) {
          error("External request failed.", e);
          routingResult = {
            internalEvent: {
              type: "core",
              rawPath: "/500",
              method: "GET",
              headers: {},
              url: "/500",
              query: {},
              cookies: {},
              remoteAddress: "",
            },
            // On error we need to rewrite to the 500 page which is an internal rewrite
            isExternalRewrite: false,
            isISR: false,
            origin: false,
            initialPath: internalEvent.rawPath,
            resolvedRoutes: [{ route: "/500", type: "page" }],
          };
        }
      }

      if ("type" in routingResult) {
        // response is used only in the streaming case
        if (responseStreaming) {
          const response = createServerResponse(
            {
              internalEvent,
              isExternalRewrite: false,
              isISR: false,
              resolvedRoutes: [],
              origin: false,
              initialPath: internalEvent.rawPath,
            },
            headers,
            responseStreaming,
          );
          response.statusCode = routingResult.statusCode;
          response.flushHeaders();
          const [bodyToConsume, bodyToReturn] = routingResult.body.tee();
          for await (const chunk of bodyToConsume) {
            response.write(chunk);
          }
          response.end();
          routingResult.body = bodyToReturn;
        }
        return routingResult;
      }

      const preprocessedEvent = routingResult.internalEvent;
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

      const mergeHeadersPriority = globalThis.openNextConfig.dangerous
        ?.headersAndCookiesPriority
        ? globalThis.openNextConfig.dangerous.headersAndCookiesPriority(
            preprocessedEvent,
          )
        : "middleware";
      const store = globalThis.__openNextAls.getStore();
      if (store) {
        store.mergeHeadersPriority = mergeHeadersPriority;
      }

      const req = new IncomingMessage(reqProps);
      const res = createServerResponse(
        routingResult,
        overwrittenResponseHeaders,
        responseStreaming,
      );

      await processRequest(req, res, preprocessedEvent);

      const {
        statusCode,
        headers: responseHeaders,
        isBase64Encoded,
        body,
      } = convertRes(res);

      const internalResult = {
        type: internalEvent.type,
        statusCode,
        headers: responseHeaders,
        body,
        isBase64Encoded,
      };
      const requestId = store?.requestId;

      if (requestId) {
        // reset lastModified. We need to do this to avoid memory leaks
        delete globalThis.lastModified[requestId];
      }

      return internalResult;
    },
  );
}

async function processRequest(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  internalEvent: InternalEvent,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    //#override applyNextjsPrebundledReact
    setNextjsPrebundledReact(internalEvent.rawPath);
    //#endOverride

    // Next Server
    await requestHandler(req, res);
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
