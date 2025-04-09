import { Writable } from "node:stream";

import type { StreamCreator } from "types/open-next";
import type {
  AwsLambdaEvent,
  AwsLambdaReturn,
  WrapperHandler,
} from "types/overrides";
import { formatWarmerResponse } from "utils/overrides";

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

    const response = await handler(internalEvent, {
      streamCreator: fakeStream,
    });

    return converter.convertTo(response, event);
  };

export default {
  wrapper: handler,
  name: "aws-lambda",
  supportStreaming: false,
};
