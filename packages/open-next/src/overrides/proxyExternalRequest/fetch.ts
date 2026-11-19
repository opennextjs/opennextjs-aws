import type { ProxyExternalRequest } from "types/overrides";
import { emptyReadableStream } from "utils/stream";

const fetchProxy: ProxyExternalRequest = {
  name: "fetch-proxy",
  // @ts-ignore
  proxy: async (internalEvent) => {
    const { url, headers: eventHeaders, method, body } = internalEvent;

    const headers = Object.fromEntries(
      Object.entries(eventHeaders).filter(
        ([key]) =>
          !["cf-connecting-ip", "x-forwarded-host"].includes(key.toLowerCase()),
      ),
    );
    // Like Next.js, do not relay the `x-forwarded-host` sent by the client
    if (eventHeaders.host) {
      headers["x-forwarded-host"] = eventHeaders.host;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body as BodyInit | undefined,
    });
    const responseHeaders: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
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
