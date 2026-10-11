import type { ProxyExternalRequest } from "types/overrides";
import { ENCODE_BODY_HEADER } from "utils/encoding";
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
      // The header is internal: an upstream response must not be able to set it.
      if (key === ENCODE_BODY_HEADER) {
        return;
      }
      const cur = responseHeaders[key];
      if (cur === undefined) {
        responseHeaders[key] = value;
      } else if (Array.isArray(cur)) {
        cur.push(value);
      } else {
        responseHeaders[key] = [cur, value];
      }
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
