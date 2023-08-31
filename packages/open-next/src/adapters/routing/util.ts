import { isBinaryContentType } from "../binary";
import { ServerResponse } from "../response";

export function isExternal(url?: string) {
  if (!url) return false;
  const pattern = /^https?:\/\//;
  return pattern.test(url);
}

export function getUrlParts(url: string, isExternal: boolean) {
  if (!isExternal) {
    return {
      hostname: "",
      pathname: url,
      protocol: "",
    };
  }
  const { hostname, pathname, protocol } = new URL(url);
  return {
    hostname,
    pathname,
    protocol,
  };
}

export function convertRes(res: ServerResponse) {
  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  const headers = ServerResponse.headers(res);
  const isBase64Encoded = isBinaryContentType(
    Array.isArray(headers["content-type"])
      ? headers["content-type"][0]
      : headers["content-type"],
  );
  const encoding = isBase64Encoded ? "base64" : "utf8";
  const body = ServerResponse.body(res).toString(encoding);
  return {
    statusCode,
    headers,
    body,
    isBase64Encoded,
  };
}

export function convertQuery(query: Record<string, string | string[]>) {
  const urlQuery: Record<string, string> = {};
  Object.keys(query).forEach((k) => {
    const v = query[k];
    urlQuery[k] = Array.isArray(v) ? v.join(",") : v;
  });
  return urlQuery;
}
