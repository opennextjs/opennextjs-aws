import type { IncomingMessage, ServerResponse } from "node:http";

import type { InternalEvent, InternalResult } from "../../event-mapper";

export type ProcessInternalEventResult<
  Req extends IncomingMessage,
  Res extends ServerResponse,
> =
  | {
      internalEvent: InternalEvent;
      req: Req;
      res: Res;
      isExternalRewrite?: boolean;
    }
  | InternalResult;

export interface PostProcessOptions {
  internalEvent: InternalEvent;
  req: IncomingMessage;
  res: ServerResponse;
  isExternalRewrite?: boolean;
}
