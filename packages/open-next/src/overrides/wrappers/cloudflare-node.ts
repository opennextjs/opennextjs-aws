import type {
  InternalEvent,
  InternalResult,
  StreamCreator,
} from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

import { Writable } from "node:stream";

// `IdentityTransformStream` is a Cloudflare Workers specific, C++-backed
// identity TransformStream optimized for byte streams.
// https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#identitytransformstream
declare class IdentityTransformStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {}

// Response with null body status (101, 204, 205, or 304) cannot have a body.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const handler: WrapperHandler<InternalEvent, InternalResult> =
  async (handler, converter) =>
  async (
    request: Request,
    env: Record<string, string>,
    ctx: any,
    abortSignal: AbortSignal,
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
    const url = new URL(request.url);

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

        // Optimize: skip ReadableStream creation for null body statuses
        if (NULL_BODY_STATUSES.has(statusCode)) {
          const response = new Response(null, {
            status: statusCode,
            headers: responseHeaders,
          });
          resolveResponse(response);

          // Return a no-op Writable that discards all data
          return new Writable({
            write(chunk, encoding, callback) {
              callback();
            },
          });
        }

        // Use the native (C++-backed) `IdentityTransformStream` instead of a
        // JS-backed `ReadableStream` with a manually captured controller.
        //
        // With the JS-backed stream, the runtime's pump of the response body
        // has been observed to intermittently stall mid-stream on deployed
        // Workers: the last enqueued flush(es) are never delivered and the
        // terminating chunk is never sent, leaving the client connection open
        // indefinitely. Because `Writable.write` acknowledged chunks without
        // waiting for the consumer, nothing in the worker ever noticed the
        // stall (the invocation simply never completed).
        //
        // The native stream is pumped by the runtime itself and
        // `writer.write()` resolves only once the chunk is accepted, giving
        // real backpressure end-to-end and avoiding the stall entirely.
        const { readable, writable } = new IdentityTransformStream();

        const response = new Response(readable, {
          status: statusCode,
          headers: responseHeaders,
        });
        resolveResponse(response);

        const writer = writable.getWriter();

        return new Writable({
          write(chunk, encoding, callback) {
            const bytes =
              chunk instanceof Uint8Array
                ? chunk
                : Buffer.from(chunk, encoding);
            writer.write(bytes).then(
              () => callback(),
              (e) => callback(e),
            );
          },
          final(callback) {
            writer.close().then(
              () => callback(),
              (e) => callback(e),
            );
          },
          destroy(error, callback) {
            const done = error
              ? writer.abort(error)
              : writer.close().catch(() => {
                  // Ignore "already closed" errors
                });
            done.then(
              () => callback(error),
              () => callback(error),
            );
          },
        });
      },
      // This is for passing along the original abort signal from the initial Request you retrieve in your worker
      // Ensures that the response we pass to NextServer is aborted if the request is aborted
      // By doing this `request.signal.onabort` will work in route handlers
      abortSignal: abortSignal,
      // There is no need to retain the chunks that were pushed to the response stream.
      retainChunks: false,
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
