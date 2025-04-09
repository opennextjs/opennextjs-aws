import { Readable, type Transform, Writable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import zlib from "node:zlib";

import type { AwsLambdaEvent, AwsLambdaReturn } from "types/aws-lambda";
import type { InternalResult, StreamCreator } from "types/open-next";
import type { WrapperHandler } from "types/overrides";
import { error } from "../../adapters/logger";
import { formatWarmerResponse } from "./aws-lambda";

const handler: WrapperHandler =
  async (handler, converter) =>
  async (event: AwsLambdaEvent): Promise<AwsLambdaReturn> => {
    // Handle warmer event
    if ("type" in event) {
      return formatWarmerResponse(event);
    }

    const internalEvent = await converter.convertFrom(event);
    // This is a workaround
    // https://github.com/opennextjs/opennextjs-aws/blob/e9b37fd44eb856eb8ae73168bf455ff85dd8b285/packages/open-next/src/overrides/wrappers/aws-lambda.ts#L49-L53
    const fakeStream: StreamCreator = {
      writeHeaders: () => {
        return new Writable({
          write: (_chunk, _encoding, callback) => {
            callback();
          },
        });
      },
    };

    const handlerResponse = await handler(internalEvent, {
      streamCreator: fakeStream,
    });

    // Check if response is already compressed
    // The handlers response headers are lowercase
    const alreadyEncoded = handlerResponse.headers["content-encoding"] ?? "";

    // Return early here if the response is already compressed
    if (alreadyEncoded) {
      return converter.convertTo(handlerResponse, event);
    }

    // We compress the body if the client accepts it
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
    let transform: Transform;

    switch (encoding) {
      case "br":
        transform = zlib.createBrotliCompress({
          params: {
            // This is a compromise between speed and compression ratio.
            // The default one will most likely timeout an AWS Lambda with default configuration on large bodies (>6mb).
            // Therefore we set it to 6, which is a good compromise.
            [zlib.constants.BROTLI_PARAM_QUALITY]:
              Number(process.env.BROTLI_QUALITY) ?? 6,
          },
        });
        break;
      case "gzip":
        transform = zlib.createGzip();
        break;
      case "deflate":
        transform = zlib.createDeflate();
        break;
      default:
        return body;
    }
    return Readable.toWeb(readable.pipe(transform));
  } catch (e) {
    error("Error compressing body:", e);
    // Fall back to no compression on error
    return body;
  }
}
