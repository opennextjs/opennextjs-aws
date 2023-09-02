import type { InternalEvent, InternalResult } from "../event-mapper";
import type { IncomingMessage } from "../http/request";
import type { ServerResponse } from "../http/response";

export type ProcessInternalEventResult =
  | {
      internalEvent: InternalEvent;
      req: IncomingMessage;
      res: ServerResponse;
      isExternalRewrite: boolean;
    }
  | InternalResult;

export type ProcessInternalEvent = (
  internalEvent: InternalEvent,
  createResponse: CreateResponse,
) => Promise<ProcessInternalEventResult>;

export interface PostProcessOptions {
  internalEvent: InternalEvent;
  req: IncomingMessage;
  res: ServerResponse;
  isExternalRewrite?: boolean;
}

export type CreateResponse = (
  method: string,
  headers: Record<string, string | string[] | undefined>,
) => ServerResponse;
