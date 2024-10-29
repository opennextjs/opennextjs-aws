import type {
  InternalEvent,
  InternalResult,
  WrapperHandler,
} from "types/open-next";

import type { MiddlewareOutputEvent } from "../../core/routingHandler";

const handler: WrapperHandler<
  InternalEvent,
  InternalResult | ({ type: "middleware" } & MiddlewareOutputEvent)
> =
  async (handler, converter) =>
  async (event: Request, env: Record<string, string>): Promise<Response> => {
    globalThis.process = process;

    // Set the environment variables
    // Cloudflare suggests to not override the process.env object but instead apply the values to it
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }

    const internalEvent = await converter.convertFrom(event);

    const response = await handler(internalEvent);

    const result: Response = await converter.convertTo(response);

    return result;
  };

export default {
  wrapper: handler,
  name: "cloudflare",
  supportStreaming: true,
  edgeRuntime: true,
};
