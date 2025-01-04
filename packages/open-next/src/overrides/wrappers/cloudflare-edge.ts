import type {
  InternalEvent,
  InternalResult,
  MiddlewareResult,
} from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

const cfPropNameMapping: Record<
  string,
  string | [(s: string) => string, string]
> = {
  // The city name is percent-encoded.
  // See https://github.com/vercel/vercel/blob/4cb6143/packages/functions/src/headers.ts#L94C19-L94C37
  city: [encodeURIComponent, "x-open-next-city"],
  country: "x-open-next-country",
  regionCode: "x-open-next-region",
  latitude: "x-open-next-latitude",
  longitude: "x-open-next-longitude",
};

interface WorkerContext {
  waitUntil: (promise: Promise<unknown>) => void;
}

const handler: WrapperHandler<
  InternalEvent,
  InternalResult | MiddlewareResult
> =
  async (handler, converter) =>
  async (
    request: Request,
    env: Record<string, string>,
    ctx: WorkerContext,
  ): Promise<Response> => {
    globalThis.process = process;
    globalThis.openNextWaitUntil = ctx.waitUntil.bind(ctx);

    // Set the environment variables
    // Cloudflare suggests to not override the process.env object but instead apply the values to it
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }

    const internalEvent = await converter.convertFrom(request);

    // Retrieve geo information from the cloudflare request
    // See https://developers.cloudflare.com/workers/runtime-apis/request
    // Note: This code could be moved to a cloudflare specific converter when one is created.
    const cfProperties = (request as any).cf as
      | Record<string, string | null>
      | undefined;
    for (const [propName, mapping] of Object.entries(cfPropNameMapping)) {
      const propValue = cfProperties?.[propName];
      if (propValue != null) {
        const [encode, headerName] = Array.isArray(mapping)
          ? mapping
          : [null, mapping];
        internalEvent.headers[headerName] = encode
          ? encode(propValue)
          : propValue;
      }
    }

    const response = await handler(internalEvent);

    const result: Response = await converter.convertTo(response);

    return result;
  };

export default {
  wrapper: handler,
  name: "cloudflare-edge",
  supportStreaming: true,
  edgeRuntime: true,
} satisfies Wrapper<InternalEvent, InternalResult | MiddlewareResult>;
