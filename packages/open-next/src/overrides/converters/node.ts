import type { IncomingMessage } from "node:http";

import { parseCookies } from "http/util";
import type { InternalResult } from "types/open-next";
import type { Converter } from "types/overrides";
import { extractHostFromHeaders, getQueryFromSearchParams } from "./utils.js";

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

    const headers = Object.fromEntries(
      Object.entries(req.headers ?? {})
        .map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(",") : value,
        ])
        .filter(([key]) => key),
    );
    const url = new URL(req.url!, `http://${extractHostFromHeaders(headers)}`);
    const query = getQueryFromSearchParams(url.searchParams);
    return {
      type: "core",
      method: req.method ?? "GET",
      rawPath: url.pathname,
      url: url.href,
      body,
      headers,
      remoteAddress:
        (req.headers["x-forwarded-for"] as string) ??
        req.socket.remoteAddress ??
        "::1",
      query,
      cookies: Object.fromEntries(
        parseCookies(req.headers.cookie)?.map((cookie) => {
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
