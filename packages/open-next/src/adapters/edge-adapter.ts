import type { ReadableStream } from "node:stream/web";

import type { InternalEvent, InternalResult } from "types/open-next";
import { runWithOpenNextRequestContext } from "utils/promise";
import { emptyReadableStream } from "utils/stream";

import type { OpenNextHandlerOptions } from "types/overrides";
// We import it like that so that the edge plugin can replace it
import { NextConfig } from "../adapters/config";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  convertBodyToReadableStream,
  convertToQueryString,
} from "../core/routing/util";

globalThis.__openNextAls = new AsyncLocalStorage();

const defaultHandler = async (
  internalEvent: InternalEvent,
  options?: OpenNextHandlerOptions,
): Promise<InternalResult> => {
  globalThis.isEdgeRuntime = true;

  // We run everything in the async local storage context so that it is available in edge runtime functions
  return runWithOpenNextRequestContext(
    { isISRRevalidation: false, waitUntil: options?.waitUntil },
    async () => {
      const host = internalEvent.headers.host
        ? `https://${internalEvent.headers.host}`
        : "http://localhost:3000";
      const initialUrl = new URL(internalEvent.rawPath, host);
      initialUrl.search = convertToQueryString(internalEvent.query);
      const url = initialUrl.toString();

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
        url,
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
