import { debug, error } from "node:console";
import { request } from "node:https";
import { Readable } from "node:stream";
import type { InternalEvent, InternalResult } from "types/open-next";
import type { ProxyExternalRequest } from "types/overrides";
import { isBinaryContentType } from "../../adapters/binary";

function filterHeadersForProxy(
  headers: Record<string, string | string[] | undefined>,
) {
  const filteredHeaders: Record<string, string | string[]> = {};
  const disallowedHeaders = [
    "host",
    "connection",
    "via",
    "x-cache",
    "transfer-encoding",
    "content-encoding",
    "content-length",
  ];
  Object.entries(headers).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (disallowedHeaders.includes(lowerKey) || lowerKey.startsWith("x-amz"))
      return;

    filteredHeaders[key] = value?.toString() ?? "";
  });
  return filteredHeaders;
}

const nodeProxy: ProxyExternalRequest = {
  name: "node-proxy",
  proxy: (internalEvent: InternalEvent) => {
    const { url, headers, method, body } = internalEvent;
    debug("proxyRequest", url);
    return new Promise<InternalResult>((resolve, reject) => {
      const filteredHeaders = filterHeadersForProxy(headers);
      debug("filteredHeaders", filteredHeaders);
      const req = request(
        url,
        {
          headers: filteredHeaders,
          method,
          rejectUnauthorized: false,
        },
        (_res) => {
          const nodeReadableStream =
            _res.headers["content-encoding"] === "br"
              ? _res.pipe(require("node:zlib").createBrotliDecompress())
              : _res.headers["content-encoding"] === "gzip"
                ? _res.pipe(require("node:zlib").createGunzip())
                : _res;

          const isBase64Encoded =
            isBinaryContentType(headers["content-type"]) ||
            !!headers["content-encoding"];
          const result: InternalResult = {
            type: "core",
            headers: filterHeadersForProxy(_res.headers),
            statusCode: _res.statusCode ?? 200,
            // TODO: check base64 encoding
            isBase64Encoded,
            body: Readable.toWeb(nodeReadableStream),
          };

          resolve(result);

          _res.on("error", (e) => {
            error("proxyRequest error", e);
            reject(e);
          });
        },
      );

      if (body && method !== "GET" && method !== "HEAD") {
        req.write(body);
      }
      req.end();
    });
  },
};

export default nodeProxy;
