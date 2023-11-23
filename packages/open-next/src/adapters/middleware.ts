import { InternalEvent } from "types/open-next";

import { createGenericHandler } from "../core/createGenericHandler";
import routingHandler from "../core/routingHandler";

const defaultHandler = async (internalEvent: InternalEvent) => {
  const result = await routingHandler(internalEvent);
  if ("internalEvent" in result) {
    return {
      type: "middleware",
      internalEvent: result.internalEvent,
      headers: result.headers,
      isExternalRewrite: result.isExternalRewrite,
    };
  } else {
    return result;
  }
};

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "middleware",
  defaultConverter: "edge",
});
