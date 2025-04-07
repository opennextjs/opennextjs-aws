import { Readable, Writable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import zlib from "node:zlib";

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from "aws-lambda";
import type { WrapperHandler } from "types/overrides";

import type { InternalResult, StreamCreator } from "types/open-next";
import { error } from "../../adapters/logger";
import type {
  WarmerEvent,
  WarmerResponse,
} from "../../adapters/warmer-function";

type AwsLambdaEvent =
  | APIGatewayProxyEventV2
  | CloudFrontRequestEvent
  | APIGatewayProxyEvent
  | WarmerEvent;

type AwsLambdaReturn =
  | APIGatewayProxyResultV2
  | APIGatewayProxyResult
  | CloudFrontRequestResult
  | WarmerResponse;

function formatWarmerResponse(event: WarmerEvent) {
  return new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId, type: "warmer" } satisfies WarmerResponse);
    }, event.delay);
  });
}

const handler: WrapperHandler =
  async (handler, converter) =>
  async (event: AwsLambdaEvent): Promise<AwsLambdaReturn> => {
    // Handle warmer event
    if ("type" in event) {
      return formatWarmerResponse(event);
    }

    const internalEvent = await converter.convertFrom(event);
    //TODO: create a simple reproduction and open an issue in the node repo
    //This is a workaround, there is an issue in node that causes node to crash silently if the OpenNextNodeResponse stream is not consumed
    //This does not happen everytime, it's probably caused by suspended component in ssr (either via <Suspense> or loading.tsx)
    //Everyone that wish to create their own wrapper without a StreamCreator should implement this workaround
    //This is not necessary if the underlying handler does not use OpenNextNodeResponse (At the moment, OpenNextNodeResponse is used by the node runtime servers and the image server)
    const fakeStream: StreamCreator = {
      writeHeaders: () => {
        return new Writable({
          write: (_chunk, _encoding, callback) => {
            callback();
          },
        });
      },
    };

    const acceptEncoding =
      internalEvent.headers["accept-encoding"] ??
      internalEvent.headers["Accept-Encoding"] ??
      "";

    let contentEncoding: string | null = null;
    if (acceptEncoding?.includes("br")) {
      contentEncoding = "br";
    } else if (acceptEncoding?.includes("gzip")) {
      contentEncoding = "gzip";
    } else if (acceptEncoding?.includes("deflate")) {
      contentEncoding = "deflate";
    }

    const handlerResponse = await handler(internalEvent, {
      streamCreator: fakeStream,
    });

    const response: InternalResult = {
      ...handlerResponse,
      body: compressBody(handlerResponse.body, contentEncoding),
      headers: {
        ...handlerResponse.headers,
        ...(contentEncoding ? { "content-encoding": contentEncoding } : {}),
      },
      isBase64Encoded: !!contentEncoding || handlerResponse.isBase64Encoded,
    };

    return converter.convertTo(response, event);
  };

export default {
  wrapper: handler,
  name: "aws-lambda-compressed",
  supportStreaming: false,
};

function compressBody(body: ReadableStream, encoding: string | null) {
  // If no encoding is specified, return original body
  if (!encoding) return body;
  try {
    const readable = Readable.fromWeb(body);

    switch (encoding) {
      case "br":
        return Readable.toWeb(
          readable.pipe(
            zlib.createBrotliCompress({
              params: {
                // This is a compromise between speed and compression ratio.
                // The default one will most likely timeout an AWS Lambda with default configuration on large bodies (>6mb).
                // Therefore we set it to 6, which is a good compromise.
                [zlib.constants.BROTLI_PARAM_QUALITY]:
                  Number(process.env.BROTLI_QUALITY) ?? 6,
              },
            }),
          ),
        );
      case "gzip":
        return Readable.toWeb(readable.pipe(zlib.createGzip()));
      case "deflate":
        return Readable.toWeb(readable.pipe(zlib.createDeflate()));
      default:
        return body;
    }
  } catch (e) {
    error("Error compressing body:", e);
    // Fall back to no compression on error
    return body;
  }
}
