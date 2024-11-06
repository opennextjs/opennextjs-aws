import type { IncomingMessage } from "node:http";

import { parseCookies } from "http/util";
import type { InternalResult } from "types/open-next";
import type { Converter } from "types/overrides";

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
      type: "core",
      method: req.method ?? "GET",
      rawPath: url.pathname,
      url: url.pathname + url.search,
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
  convertTo: async (internalResult: InternalResult) => ({
    body: internalResult.body,
    headers: internalResult.headers,
    statusCode: internalResult.statusCode,
  }),
  name: "node",
};

export default converter;
