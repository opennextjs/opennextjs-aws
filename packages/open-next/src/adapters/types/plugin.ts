import type { InternalEvent, InternalResult } from "../event-mapper";
import { OpenNextNodeResponse } from "../http/openNextResponse";
import type { IncomingMessage } from "../http/request";

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
