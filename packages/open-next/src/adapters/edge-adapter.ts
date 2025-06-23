import type { ReadableStream } from "node:stream/web";

import type { InternalEvent, InternalResult } from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";
import { emptyReadableStream } from "utils/stream";

import type { OpenNextHandlerOptions } from "types/overrides";
// We import it like that so that the edge plugin can replace it
import { NextConfig } from "../adapters/config";
import { createGenericHandler } from "../core/createGenericHandler";
import { convertBodyToReadableStream } from "../core/routing/util";
import { INTERNAL_EVENT_REQUEST_ID } from "../core/routingHandler";

globalThis.__openNextAls = new AsyncLocalStorage();

const defaultHandler = async (
  internalEvent: InternalEvent,
  options?: OpenNextHandlerOptions,
): Promise<InternalResult> => {
  globalThis.isEdgeRuntime = true;

  const requestId = globalThis.openNextConfig.middleware?.external
    ? internalEvent.headers[INTERNAL_EVENT_REQUEST_ID]
    : Math.random().toString(36);

  // We run everything in the async local storage context so that it is available in edge runtime functions
  return runWithOpenNextRequestContext(
    { isISRRevalidation: false, waitUntil: options?.waitUntil, requestId },
    async () => {
      // @ts-expect-error - This is bundled
      const handler = await import("./middleware.mjs");

      const response: Response = await handler.default({
        headers: internalEvent.headers,
        method: internalEvent.method || "GET",
        nextConfig: {
          basePath: NextConfig.basePath,
          i18n: NextConfig.i18n,
          trailingSlash: NextConfig.trailingSlash,
        },
        url: internalEvent.url,
        body: convertBodyToReadableStream(
          internalEvent.method,
          internalEvent.body,
        ),
      });
      const responseHeaders: Record<string, string | string[]> = {};
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders[key] = responseHeaders[key]
            ? [...responseHeaders[key], value]
            : [value];
        } else {
          responseHeaders[key] = value;
        }
      });

      const body =
        (response.body as ReadableStream<Uint8Array>) ?? emptyReadableStream();

      return {
        type: "core",
        statusCode: response.status,
        headers: responseHeaders,
        body: body,
        // Do we need to handle base64 encoded response?
        isBase64Encoded: false,
      };
    },
  );
};

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "middleware",
});

export default {
  fetch: handler,
};
