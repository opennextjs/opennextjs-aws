import { Writable } from "node:stream";
import zlib from "node:zlib";

import { APIGatewayProxyEventV2 } from "aws-lambda";
import { StreamCreator } from "http/index.js";
import { WrapperHandler } from "types/open-next";

import { error } from "../adapters/logger";
import { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";

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
    async (event: AwsLambdaEvent, responseStream): Promise<AwsLambdaReturn> => {
      if ("type" in event) {
        const result = await formatWarmerResponse(event);
        responseStream.end(Buffer.from(JSON.stringify(result)), "utf-8");
        return;
      }

      const internalEvent = await converter.convertFrom(event);
      let _hasWriten = false;

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
          _prelude.headers["content-encoding"] = contentEncoding;

          responseStream.setContentType(
            "application/vnd.awslambda.http-integration-response",
          );
          _prelude.headers["content-encoding"] = contentEncoding;
          // We need to remove the set-cookie header as otherwise it will be set twice, once with the cookies in the prelude, and a second time with the set-cookie headers
          delete _prelude.headers["set-cookie"];
          const prelude = JSON.stringify(_prelude);

          responseStream.write(prelude);

          responseStream.write(new Uint8Array(8));

          return compressedStream ?? responseStream;
        },
        onWrite: () => {
          _hasWriten = true;
        },
        onFinish: () => {
          if (!_hasWriten) {
            compressedStream?.end(new Uint8Array(8));
          }
        },
      };

      const response = await handler(internalEvent, streamCreator);

      return converter.convertTo(response);
    },
  );

export default {
  wrapper: handler,
  name: "aws-lambda-streaming",
  supportStreaming: true,
};
