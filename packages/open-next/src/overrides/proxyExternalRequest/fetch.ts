import type { ProxyExternalRequest } from "types/overrides";
import { emptyReadableStream } from "utils/stream";

const fetchProxy: ProxyExternalRequest = {
  name: "fetch-proxy",
  // @ts-ignore
  proxy: async (internalEvent) => {
    const { url, headers, method, body } = internalEvent;
    const response = await fetch(url, {
      method,
      headers,
      body,
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
