import { Writable } from "node:stream";
import zlib from "node:zlib";

import { APIGatewayProxyEventV2 } from "aws-lambda";

import { StreamCreator } from "../adapters/http/openNextResponse";
import { parseHeaders } from "../adapters/http/util";
import { Wrapper } from "../adapters/types/open-next";
import { parseCookies } from "../adapters/util";
import { WarmerEvent } from "../adapters/warmer-function";

type AwsLambdaEvent = APIGatewayProxyEventV2 | WarmerEvent;

type AwsLambdaReturn = void;
const handler: Wrapper = async (handler, converter) =>
  awslambda.streamifyResponse(
    async (event: AwsLambdaEvent, responseStream): Promise<AwsLambdaReturn> => {
      const internalEvent = converter.convertFrom(event);
      let _hasWriten = false;
      let _headersSent = false;

      //Handle compression
      const acceptEncoding = internalEvent.headers["accept-encoding"] ?? "";
      let contentEncoding: string;
      let compressedStream: Writable | undefined;

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
          responseStream.cork();
          // FIXME: This is extracted from the docker lambda node 18 runtime
          // https://gist.github.com/conico974/13afd708af20711b97df439b910ceb53#file-index-mjs-L921-L932
          // We replace their write with ours which are inside a setImmediate
          // This way it seems to work all the time
          // I think we can't ship this code as it is, it could break at anytime if they decide to change the runtime and they already did it in the past

          responseStream.setContentType(
            "application/vnd.awslambda.http-integration-response",
          );
          _prelude.headers["content-encoding"] = contentEncoding;
          const prelude = JSON.stringify(_prelude);

          // Try to flush the buffer to the client to invoke
          // the streaming. This does not work 100% of the time.

          responseStream.write("\n\n");

          responseStream.write(prelude);

          responseStream.write(new Uint8Array(8));

          if (responseStream.writableCorked) {
            for (let i = 0; i < responseStream.writableCorked; i++) {
              responseStream.uncork();
            }
          }

          _headersSent = true;

          return compressedStream ?? responseStream;
        },
        onWrite: () => {
          _hasWriten = true;
          // Force flushing data, seems necessary for aws lambda streaming to work reliably
          // We need to reevaluate this if it causes issues on other platforms
          if (compressedStream?.writableCorked) {
            compressedStream?.uncork();
          }
        },
      };

      const response = await handler(internalEvent, streamCreator);

      if (!compressedStream.writableFinished) {
        // If the headers are not sent, we need to send them
        if (!_headersSent) {
          streamCreator.writeHeaders({
            statusCode: response?.statusCode ?? 500,
            cookies: parseCookies(response?.headers["set-cookie"]) ?? [],
            headers: parseHeaders(response?.headers),
          });
        }
        compressedStream.end(_hasWriten ? undefined : new Uint8Array(8));
      }

      return converter.convertTo(response);
    },
  );

export default handler;
