import type { ProxyExternalRequest } from "types/overrides";
import { emptyReadableStream } from "utils/stream";

const fetchProxy: ProxyExternalRequest = {
  name: "fetch-proxy",
  // @ts-ignore
  proxy: async (internalEvent) => {
    const { url, headers: eventHeaders, method, body } = internalEvent;

    const headers = Object.fromEntries(
      Object.entries(eventHeaders).filter(
        ([key]) => key.toLowerCase() !== "cf-connecting-ip",
      ),
    );

    const response = await fetch(url, {
      method,
      headers,
      body: body as BodyInit | undefined,
    });
    const responseHeaders: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      type: "core",
      headers: responseHeaders,
      statusCode: response.status,
      isBase64Encoded: true,
      body: response.body ?? emptyReadableStream(),
    };
  },
};

export default fetchProxy;
