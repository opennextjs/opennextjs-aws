import { IncomingMessage } from "http";

import { InternalResult } from "../adapters/event-mapper";
import { Converter } from "../adapters/types/open-next";
import { parseCookies } from "../adapters/util";

const converter: Converter = {
  convertFrom: async (req: IncomingMessage) => {
    const body = await new Promise<Buffer>((resolve) => {
      const chunks: Uint8Array[] = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const query = Object.fromEntries(url.searchParams.entries());
    return {
      type: "v2",
      method: req.method ?? "GET",
      rawPath: url.pathname,
      url: url.toString(),
      body,
      headers: Object.fromEntries(
        Object.entries(req.headers ?? {})
          .map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(",") : value,
          ])
          .filter(([key]) => key),
      ),
      remoteAddress:
        (req.headers["x-forwarded-for"] as string) ??
        req.socket.remoteAddress ??
        "::1",
      query,
      cookies: Object.fromEntries(
        parseCookies(req.headers["cookie"])?.map((cookie) => {
          const [key, value] = cookie.split("=");
          return [key, value];
        }) ?? [],
      ),
    };
  },
  // Nothing to do here, it's streaming
  convertTo: (internalResult: InternalResult) => ({
    body: internalResult.body,
    headers: internalResult.headers,
    statusCode: internalResult.statusCode,
  }),
};

export default converter;
