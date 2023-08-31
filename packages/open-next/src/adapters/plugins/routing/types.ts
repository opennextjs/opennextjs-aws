import type { InternalEvent, InternalResult } from "../../event-mapper";
import { IncomingMessage } from "../../request";
import { ServerResponse } from "../../response";

export type ProcessInternalEventResult =
  | {
      internalEvent: InternalEvent;
      req: IncomingMessage;
      res: ServerResponse;
      isExternalRewrite: boolean;
    }
  | InternalResult;

export interface PostProcessOptions {
  internalEvent: InternalEvent;
  req: IncomingMessage;
  res: ServerResponse;
  isExternalRewrite?: boolean;
}
