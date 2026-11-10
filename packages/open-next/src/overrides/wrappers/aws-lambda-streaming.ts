import { Readable, type Writable } from "node:stream";
import zlib from "node:zlib";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { Wrapper, WrapperHandler } from "types/overrides";

import type { StreamCreator, WaitUntil } from "types/open-next";
import { debug, error } from "../../adapters/logger";
import type {
  WarmerEvent,
  WarmerResponse,
} from "../../adapters/warmer-function";
import { getBrotliQuality } from "../../utils/compression";
import { DetachedPromiseRunner } from "../../utils/promise";

type AwsLambdaEvent = APIGatewayProxyEventV2 | WarmerEvent;

type AwsLambdaReturn = void;

function formatWarmerResponse(event: WarmerEvent) {
  const result = new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId, type: "warmer" } satisfies WarmerResponse);
    }, event.delay);
  });
  return result;
}

const PIPE_FLUSH_TIMEOUT_MS = 5_000;
const MIN_BODY_SETTLE_TIMEOUT_MS = 25_000;
const SETTLE_SAFETY_MARGIN_MS = 10_000;

function waitForWritableSettled(
  stream: Writable,
  timeoutMs: number,
): Promise<"settled" | "timed-out"> {
  if (stream.writableFinished || stream.destroyed) {
    return Promise.resolve("settled");
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      removeListeners();
      resolve("timed-out");
    }, timeoutMs);
    const onSettled = () => {
      clearTimeout(timer);
      removeListeners();
      resolve("settled");
    };
    const removeListeners = () => {
      stream.off("finish", onSettled);
      stream.off("close", onSettled);
      stream.off("error", onSettled);
    };
    stream.once("finish", onSettled);
    stream.once("close", onSettled);
    stream.once("error", onSettled);
  });
}

/**
 * The handler (and any `waitUntil` work) settling does not guarantee the
 * response stream has flushed its final chunk: with
 * `callbackWaitsForEmptyEventLoop = false` the sandbox can freeze before the
 * piped stream's `end()` propagates, leaving the HTTP response without its
 * terminal chunk. A CDN in front (e.g. CloudFront) then holds the pooled
 * origin connection until its origin read timeout, and that connection is
 * poisoned for the next request. Hold the invocation open until the stream
 * settles, with a bounded force-end fallback. The body wait is derived from
 * the invocation's remaining time so the fallback can only fire near the
 * function timeout, never while a legitimate slow stream is still writing.
 * See #1315.
 */
async function ensureResponseStreamSettles(
  bodyStream: Writable,
  responseStream: Writable,
  context: { getRemainingTimeInMillis: () => number },
): Promise<void> {
  const bodySettleTimeoutMs = Math.max(
    context.getRemainingTimeInMillis() - SETTLE_SAFETY_MARGIN_MS,
    MIN_BODY_SETTLE_TIMEOUT_MS,
  );
  const bodyOutcome = await waitForWritableSettled(
    bodyStream,
    bodySettleTimeoutMs,
  );
  if (bodyOutcome === "timed-out") {
    error("Response body stream did not end after the handler settled; forcing end");
    bodyStream.end();
  }
  const responseOutcome = await waitForWritableSettled(
    responseStream,
    PIPE_FLUSH_TIMEOUT_MS,
  );
  if (responseOutcome === "timed-out") {
    error("Response stream did not finish after body end; forcing end");
    responseStream.end();
    await waitForWritableSettled(responseStream, PIPE_FLUSH_TIMEOUT_MS);
  }
}

const handler: WrapperHandler = async (handler, converter) =>
  awslambda.streamifyResponse(
    async (
      event: AwsLambdaEvent,
      responseStream,
      context,
    ): Promise<AwsLambdaReturn> => {
      context.callbackWaitsForEmptyEventLoop = false;
      if ("type" in event) {
        const result = await formatWarmerResponse(event);
        responseStream.end(Buffer.from(JSON.stringify(result)), "utf-8");
        await globalThis.__next_route_preloader("warmerEvent");
        return;
      }

      const internalEvent = await converter.convertFrom(event);

      //Handle compression
      const acceptEncoding =
        internalEvent.headers["Accept-Encoding"] ??
        internalEvent.headers["accept-encoding"] ??
        "";
      let contentEncoding: string;
      let compressedStream: Writable | undefined;

      responseStream.on("error", (err) => {
        error(err);
        responseStream.end();
      });

      if (acceptEncoding.includes("br")) {
        contentEncoding = "br";
        compressedStream = zlib.createBrotliCompress({
          flush: zlib.constants.BROTLI_OPERATION_FLUSH,
          finishFlush: zlib.constants.BROTLI_OPERATION_FINISH,
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: getBrotliQuality(),
          },
        });
        compressedStream.pipe(responseStream);
      } else if (acceptEncoding.includes("gzip")) {
        contentEncoding = "gzip";
        compressedStream = zlib.createGzip({
          flush: zlib.constants.Z_SYNC_FLUSH,
        });
        compressedStream.pipe(responseStream);
      } else if (acceptEncoding.includes("deflate")) {
        contentEncoding = "deflate";
        compressedStream = zlib.createDeflate({
          flush: zlib.constants.Z_SYNC_FLUSH,
        });
        compressedStream.pipe(responseStream);
      } else {
        contentEncoding = "identity";
        compressedStream = responseStream;
      }

      // `pipe()` does not forward source errors: a compressor error while the
      // handler is writing would otherwise be an unhandled 'error' event and
      // crash the process.
      if (compressedStream !== responseStream) {
        compressedStream.on("error", (err) => {
          error(err);
          responseStream.end();
        });
      }

      const streamCreator: StreamCreator = {
        writeHeaders: (_prelude) => {
          responseStream.setContentType(
            "application/vnd.awslambda.http-integration-response",
          );
          _prelude.headers["content-encoding"] = contentEncoding;

          const prelude = JSON.stringify(_prelude);

          responseStream.write(prelude);

          responseStream.write(new Uint8Array(8));

          return compressedStream ?? responseStream;
        },
      };

      // AWS provides no native `waitUntil`, so back it with the shared
      // `DetachedPromiseRunner`, which tracks the deferred promises and awaits
      // (and logs the failures of) them before the stream closes. This keeps
      // the Lambda alive for deferred work (background revalidation, cache
      // write-through) that starts after the response body is sent — matching
      // the `waitUntil` the Cloudflare wrappers pass through, and enabling the
      // `withWaitUntil` route preloading that otherwise falls back to `none`.
      const promiseRunner = new DetachedPromiseRunner();
      const waitUntil: WaitUntil = (promise) => promiseRunner.add(promise);

      const response = await handler(internalEvent, {
        streamCreator,
        waitUntil,
      });

      const isUsingEdge = globalThis.isEdgeRuntime ?? false;
      if (isUsingEdge) {
        debug("Headers has not been set, we must be in the edge runtime");
        const stream = streamCreator.writeHeaders({
          statusCode: response.statusCode,
          headers: response.headers as Record<string, string>,
          cookies: [],
        });
        Readable.fromWeb(response.body).pipe(stream);
      }

      // Keep the invocation alive until deferred `waitUntil` work settles.
      await promiseRunner.await();

      await ensureResponseStreamSettles(
        compressedStream ?? responseStream,
        responseStream,
        context,
      );

      // return converter.convertTo(response);
    },
  );

export default {
  wrapper: handler,
  name: "aws-lambda-streaming",
  supportStreaming: true,
} satisfies Wrapper;
