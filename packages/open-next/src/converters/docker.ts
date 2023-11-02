import { IncomingMessage } from "http";

import { InternalResult } from "../adapters/event-mapper";
import { Converter } from "../adapters/types/open-next";

const converter: Converter = {
  convertFrom: (req: IncomingMessage) => ({
    type: "v2",
    method: req.method ?? "GET",
    rawPath: req.url!,
    url: req.url!,
    body: Buffer.from(""),
    headers: Object.fromEntries(
      Object.entries(req.headers ?? {})
        .map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(",") : value,
        ])
        .filter(([key]) => key),
    ),
    remoteAddress: "",
    query: {},
    cookies: {},
  }),
  // Do nothing here, it's streaming
  convertTo: (internalResult: InternalResult) => ({
    body: internalResult.body,
    headers: internalResult.headers,
    statusCode: internalResult.statusCode,
  }),
};

export default converter;
