import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from "aws-lambda";
import type { Wrapper } from "types/open-next";

import { WarmerEvent } from "../adapters/warmer-function";

type AwsLambdaEvent =
  | APIGatewayProxyEventV2
  | CloudFrontRequestEvent
  | APIGatewayProxyEvent
  | WarmerEvent;

type AwsLambdaReturn =
  | APIGatewayProxyResultV2
  | APIGatewayProxyResult
  | CloudFrontRequestResult;

const handler: Wrapper =
  async (handler, converter) =>
  async (event: AwsLambdaEvent): Promise<AwsLambdaReturn> => {
    const internalEvent = await converter.convertFrom(event);

    const response = await handler(internalEvent);

    return converter.convertTo(response);
  };

export default handler;
