import { IncomingMessage, OpenNextNodeResponse } from "http/index.js";

import { InternalEvent, InternalResult } from "./open-next";

export type ProcessInternalEventResult<Response extends OpenNextNodeResponse> =
  | {
      internalEvent: InternalEvent;
      req: IncomingMessage;
      res: Response;
      isExternalRewrite: boolean;
    }
  | InternalResult;

export type ProcessInternalEvent<
  Response extends OpenNextNodeResponse = OpenNextNodeResponse,
> = (
  internalEvent: InternalEvent,
  createResponse: CreateResponse<Response>,
) => Promise<ProcessInternalEventResult<Response>>;

export interface PostProcessOptions<
  Response extends OpenNextNodeResponse = OpenNextNodeResponse,
> {
  internalEvent: InternalEvent;
  req: IncomingMessage;
  res: Response;
  isExternalRewrite?: boolean;
}

export type CreateResponse<Response extends OpenNextNodeResponse> = (
  method: string,
  headers: Record<string, string | string[] | undefined>,
) => Response;
