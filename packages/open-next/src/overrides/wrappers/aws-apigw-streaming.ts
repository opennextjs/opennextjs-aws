import { Readable, type Writable } from "node:stream";

import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from "aws-lambda";
import type { Wrapper, WrapperHandler } from "types/overrides";

import type { StreamCreator } from "types/open-next";
import { debug } from "../../adapters/logger";
import type {
  WarmerEvent,
  WarmerResponse,
} from "../../adapters/warmer-function";

// Accepts either API Gateway payload format (v1/REST or v2/HTTP). The paired
// converter (`aws-apigw-v1` or `aws-apigw-v2`) is responsible for parsing the
// event shape; the wrapper only handles the response transport.
type AwsLambdaEvent =
  | APIGatewayProxyEventV2
  | APIGatewayProxyEvent
  | WarmerEvent;

type AwsLambdaReturn = void;

function formatWarmerResponse(event: WarmerEvent) {
  const result = new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId, type: "warmer" } satisfies WarmerResponse);
    }, event.delay);
  });
  return result;
}

/**
 * Streaming wrapper for an API Gateway proxy integration in
 * `ResponseTransferMode: STREAM`.
 *
 * Differs from `aws-lambda-streaming` (the Lambda **Function URL** wrapper) in
 * two ways, both mandated by API Gateway response streaming
 * (https://aws.amazon.com/blogs/compute/building-responsive-apis-with-amazon-api-gateway-response-streaming/):
 *
 *  1. It does NOT set the
 *     `application/vnd.awslambda.http-integration-response` content type. That
 *     marker is Function-URL-specific metadata; API Gateway forwards it onto
 *     the wire, corrupting HTTP framing.
 *  2. It does NOT compress the response. API Gateway streaming explicitly does
 *     not support content encoding, so the body is always emitted as
 *     `identity`. Compression, if desired, is handled by the CDN in front
 *     (e.g. CloudFront).
 *
 * The response framing itself — a JSON metadata prelude followed by an
 * 8-null-byte delimiter, then the payload — is identical to the Function URL
 * format and is what API Gateway expects in STREAM mode.
 */
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

      responseStream.on("error", (err) => {
        debug(err);
        responseStream.end();
      });

      const streamCreator: StreamCreator = {
        writeHeaders: (_prelude) => {
          // No content-encoding header — API Gateway streaming does not
          // support content encoding; the body is emitted as identity.
          _prelude.headers["content-encoding"] = "identity";

          const prelude = JSON.stringify(_prelude);

          responseStream.write(prelude);

          // 8-null-byte delimiter separating the JSON metadata prelude from
          // the response payload. Same framing API Gateway STREAM expects.
          responseStream.write(new Uint8Array(8));

          return responseStream;
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
        Readable.fromWeb(response.body).pipe(stream as Writable);
      }
    },
  );

export default {
  wrapper: handler,
  name: "aws-apigw-streaming",
  supportStreaming: true,
} satisfies Wrapper;
