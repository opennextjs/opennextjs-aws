import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from "aws-lambda";
import { StreamCreator } from "http/openNextResponse";
import { Writable } from "stream";
import type { WrapperHandler } from "types/open-next";

import { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";

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
      onFinish: () => {
        // Do nothing
      },
    };

    const response = await handler(internalEvent, fakeStream);

    return converter.convertTo(response, event);
  };

export default {
  wrapper: handler,
  name: "aws-lambda",
  supportStreaming: false,
};
