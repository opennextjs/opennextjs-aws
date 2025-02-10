import { Readable, type Writable } from "node:stream";
import zlib from "node:zlib";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { Wrapper, WrapperHandler } from "types/overrides";

import type { StreamCreator } from "types/open-next";
import { debug, error } from "../../adapters/logger";
import type {
  WarmerEvent,
  WarmerResponse,
} from "../../adapters/warmer-function";

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

      const response = await handler(internalEvent, { streamCreator });

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

      // return converter.convertTo(response);
    },
  );

export default {
  wrapper: handler,
  name: "aws-lambda-streaming",
  supportStreaming: true,
} satisfies Wrapper;
