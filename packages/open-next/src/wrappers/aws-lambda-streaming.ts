import { APIGatewayProxyEventV2 } from "aws-lambda";

import { ResponseStream } from "../adapters/http";
import { Wrapper } from "../adapters/types/open-next";
import { WarmerEvent } from "../adapters/warmer-function";

type AwsLambdaEvent = APIGatewayProxyEventV2 | WarmerEvent;

type AwsLambdaReturn = void;
const handler: Wrapper = async (handler, converter) =>
  awslambda.streamifyResponse(
    async (event: AwsLambdaEvent, responseStream): Promise<AwsLambdaReturn> => {
      const internalEvent = converter.convertFrom(event);

      const res = responseStream as any as ResponseStream;

      res["writeHeaders"] = (_prelude, onFinish) => {
        // FIXME: This is extracted from the docker lambda node 18 runtime
        // https://gist.github.com/conico974/13afd708af20711b97df439b910ceb53#file-index-mjs-L921-L932
        // We replace their write with ours which are inside a setImmediate
        // This way it seems to work all the time
        // I think we can't ship this code as it is, it could break at anytime if they decide to change the runtime and they already did it in the past
        responseStream.setContentType(
          "application/vnd.awslambda.http-integration-response",
        );
        const prelude = JSON.stringify(_prelude);

        // Try to flush the buffer to the client to invoke
        // the streaming. This does not work 100% of the time.
        setImmediate(() => {
          responseStream.write("\n\n");
          responseStream.uncork();
        });
        setImmediate(() => {
          responseStream.write(prelude);
        });

        setImmediate(() => {
          responseStream.write(new Uint8Array(8));

          onFinish();
        });
      };

      const response = await handler(internalEvent, res);

      return converter.convertTo(response);
    },
  );

export default handler;
