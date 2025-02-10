import type {
  InternalEvent,
  InternalResult,
  StreamCreator,
} from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

import { Writable } from "node:stream";

// Response with null body status (101, 204, 205, or 304) cannot have a body.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const handler: WrapperHandler<InternalEvent, InternalResult> =
  async (handler, converter) =>
  async (
    request: Request,
    env: Record<string, string>,
    ctx: any,
  ): Promise<Response> => {
    globalThis.process = process;

    // Set the environment variables
    // Cloudflare suggests to not override the process.env object but instead apply the values to it
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }

    const internalEvent = await converter.convertFrom(request);

    // TODO:
    // The edge converter populate event.url with the url including the origin.
    // This is required for middleware to keep track of the protocol (i.e. http with wrangler dev).
    // However the server expects that the origin is not included.
    const url = new URL(internalEvent.url);
    (internalEvent.url as string) = url.href.slice(url.origin.length);

    const { promise: promiseResponse, resolve: resolveResponse } =
      Promise.withResolvers<Response>();

    const streamCreator: StreamCreator = {
      writeHeaders(prelude: {
        statusCode: number;
        cookies: string[];
        headers: Record<string, string>;
      }): Writable {
        const { statusCode, cookies, headers } = prelude;

        const responseHeaders = new Headers(headers);
        for (const cookie of cookies) {
          responseHeaders.append("Set-Cookie", cookie);
        }

        // TODO(vicb): this is a workaround to make PPR work with `wrangler dev`
        // See https://github.com/cloudflare/workers-sdk/issues/8004
        if (url.hostname === "localhost") {
          responseHeaders.set("Content-Encoding", "identity");
        }

        const { readable, writable } = new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(Uint8Array.from(chunk.chunk ?? chunk));
          },
        });
        const body = NULL_BODY_STATUSES.has(statusCode) ? null : readable;
        const response = new Response(body, {
          status: statusCode,
          headers: responseHeaders,
        });
        resolveResponse(response);

        return Writable.fromWeb(writable);
      },
    };

    ctx.waitUntil(
      handler(internalEvent, {
        streamCreator,
        waitUntil: ctx.waitUntil.bind(ctx),
      }),
    );

    return promiseResponse;
  };

export default {
  wrapper: handler,
  name: "cloudflare-node",
  supportStreaming: true,
} satisfies Wrapper;
