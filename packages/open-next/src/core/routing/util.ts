import fs from "node:fs";
import path from "node:path";

import { isBinaryContentType } from "../../adapters/binary";
import { OpenNextNodeResponse } from "../../adapters/http/openNextResponse";
import { parseHeaders } from "../../adapters/http/util";
import { MiddlewareManifest } from "../../adapters/types/next-types";

export function isExternal(url?: string, host?: string) {
  if (!url) return false;
  const pattern = /^https?:\/\//;
  if (host) {
    return pattern.test(url) && !url.includes(host);
  }
  return pattern.test(url);
}

export function getUrlParts(url: string, isExternal: boolean) {
  // NOTE: when redirect to a URL that contains search query params,
  // compile breaks b/c it does not allow for the '?' character
  // We can't use encodeURIComponent because modal interception contains
  // characters that can't be encoded
  url = url.replaceAll("?", "%3F");
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

export function convertRes(res: OpenNextNodeResponse) {
  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  const headers = parseHeaders(res.headers);
  const isBase64Encoded = isBinaryContentType(
    Array.isArray(headers["content-type"])
      ? headers["content-type"][0]
      : headers["content-type"],
  );
  const encoding = isBase64Encoded ? "base64" : "utf8";
  const body = res.body.toString(encoding);
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

export function getMiddlewareMatch(middlewareManifest: MiddlewareManifest) {
  const rootMiddleware = middlewareManifest.middleware["/"];
  if (!rootMiddleware?.matchers) return [];
  return rootMiddleware.matchers.map(({ regexp }) => new RegExp(regexp));
}

export function loadMiddlewareManifest(nextDir: string) {
  const filePath = path.join(nextDir, "server", "middleware-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as MiddlewareManifest;
}
