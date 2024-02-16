import { CdkCustomResourceEvent } from "aws-lambda";
import { Converter } from "types/open-next";

import type { InitializationFunctionEvent } from "../adapters/dynamo-provider";

const converter: Converter<
  InitializationFunctionEvent,
  InitializationFunctionEvent
> = {
  convertFrom(event: CdkCustomResourceEvent) {
    return Promise.resolve({
      type: "initializationFunction",
      requestType: event.RequestType.toLowerCase() as
        | "create"
        | "update"
        | "delete",
      resourceId: "dynamodb-cache",
    });
  },
  convertTo(internalResult) {
    return Promise.resolve({
      type: "dummy",
      original: internalResult,
    });
  },
  name: "customResource",
};

export default converter;
