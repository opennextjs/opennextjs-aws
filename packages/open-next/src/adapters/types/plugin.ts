import type { ServerResponse } from "http";

import type { InternalEvent, InternalResult } from "../event-mapper";
import type { IncomingMessage } from "../http/request";

export type ProcessInternalEventResult<
  Response extends ServerResponse = ServerResponse,
> =
  | {
      internalEvent: InternalEvent;
      req: IncomingMessage;
      res: Response;
      isExternalRewrite: boolean;
    }
  | InternalResult;

export type ProcessInternalEvent<
  Response extends ServerResponse = ServerResponse,
> = (
  internalEvent: InternalEvent,
  createResponse: CreateResponse<Response>,
) => Promise<ProcessInternalEventResult<Response>>;

export interface PostProcessOptions<
  Response extends ServerResponse = ServerResponse,
> {
  internalEvent: InternalEvent;
  req: IncomingMessage;
  res: Response;
  isExternalRewrite?: boolean;
}

export type CreateResponse<Response extends ServerResponse = ServerResponse> = (
  method: string,
  headers: Record<string, string | string[] | undefined>,
) => Response;
