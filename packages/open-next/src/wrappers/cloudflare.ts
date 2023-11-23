import type { InternalEvent, InternalResult, Wrapper } from "types/open-next";

import { MiddlewareOutputEvent } from "../core/routingHandler";

const handler: Wrapper<
  InternalEvent,
  InternalResult | ({ type: "middleware" } & MiddlewareOutputEvent)
> =
  async (handler, converter) =>
  async (event: Request): Promise<Response> => {
    const internalEvent = await converter.convertFrom(event);

    const response = await handler(internalEvent);

    const result: Response = converter.convertTo(response);

    return result;
  };

export default handler;
