import type { OutgoingHttpHeader } from "node:http";

import type {
  CloudFrontCustomOrigin,
  CloudFrontHeaders,
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from "aws-lambda";
import { parseSetCookieHeader } from "http/util";
import type {
  InternalEvent,
  InternalResult,
  MiddlewareResult,
} from "types/open-next";
import type { Converter } from "types/overrides";
import { fromReadableStream } from "utils/stream";

import { debug } from "../../adapters/logger";
import { convertToQuery, convertToQueryString } from "../../core/routing/util";
import { extractHostFromHeaders } from "./utils";

const cloudfrontBlacklistedHeaders = [
  // Disallowed headers, see: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html#function-restrictions-disallowed-headers
  "connection",
  "expect",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "trailer",
  "upgrade",
  "x-accel-buffering",
  "x-accel-charset",
  "x-accel-limit-rate",
  "x-accel-redirect",
  /x-amz-cf-(.*)/,
  "x-amzn-auth",
  "x-amzn-cf-billing",
  "x-amzn-cf-id",
  "x-amzn-cf-xff",
  "x-amzn-errortype",
  "x-amzn-fle-profile",
  "x-amzn-header-count",
  "x-amzn-header-order",
  "x-amzn-lambda-integration-tag",
  "x-amzn-requestid",
  /x-edge-(.*)/,
  "x-cache",
  "x-forwarded-proto",
  "x-real-ip",
];

// Read-only headers, see: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html#function-restrictions-read-only-headers
// We should only remove these headers when directly responding in lambda@edge, not for the external middleware
const cloudfrontReadOnlyHeaders = [
  "accept-encoding",
  "content-length",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "transfer-encoding",
  "via",
];

function normalizeCloudFrontRequestEventHeaders(
  rawHeaders: CloudFrontHeaders,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, values] of Object.entries(rawHeaders)) {
    for (const { value } of values) {
      if (value) {
        headers[key.toLowerCase()] = value;
      }
    }
  }

  return headers;
}

async function convertFromCloudFrontRequestEvent(
  event: CloudFrontRequestEvent,
): Promise<InternalEvent> {
  const {
    method,
    uri,
    querystring,
    body,
    headers: cfHeaders,
    clientIp,
  } = event.Records[0].cf.request;
  const headers = normalizeCloudFrontRequestEventHeaders(cfHeaders);
  return {
    type: "core",
    method,
    rawPath: uri,
    url: `https://${extractHostFromHeaders(headers)}${uri}${querystring ? `?${querystring}` : ""}`,
    body: Buffer.from(
      body?.data ?? "",
      body?.encoding === "base64" ? "base64" : "utf8",
    ),
    headers,
    remoteAddress: clientIp,
    query: convertToQuery(querystring),
    cookies:
      cfHeaders.cookie?.reduce(
        (acc, cur) => {
          const { key = "", value } = cur;
          acc[key] = value;
          return acc;
        },
        {} as Record<string, string>,
      ) ?? {},
  };
}

function convertToCloudfrontHeaders(
  headers: Record<string, OutgoingHttpHeader>,
  directResponse?: boolean,
) {
  const cloudfrontHeaders: CloudFrontHeaders = {};
  Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .filter(
      ([key]) =>
        !cloudfrontBlacklistedHeaders.some((header) =>
          typeof header === "string" ? header === key : header.test(key),
        ) &&
        // Only remove read-only headers when directly responding in lambda@edge
        (directResponse ? !cloudfrontReadOnlyHeaders.includes(key) : true),
    )
    .forEach(([key, value]) => {
      if (key === "set-cookie") {
        cloudfrontHeaders[key] = parseSetCookieHeader(`${value}`).map(
          (cookie) => ({
            key,
            value: cookie,
          }),
        );
        return;
      }

      cloudfrontHeaders[key] = [
        ...(cloudfrontHeaders[key] || []),
        ...(Array.isArray(value)
          ? value.map((v) => ({ key, value: v }))
          : [{ key, value: value.toString() }]),
      ];
    });
  return cloudfrontHeaders;
}

async function convertToCloudFrontRequestResult(
  result: InternalResult | MiddlewareResult,
  originalRequest: CloudFrontRequestEvent,
): Promise<CloudFrontRequestResult> {
  if (result.type === "middleware") {
    const { method, clientIp, origin } = originalRequest.Records[0].cf.request;
    const responseHeaders = result.internalEvent.headers;

    // Handle external rewrite

    let customOrigin = origin?.custom as CloudFrontCustomOrigin;
    let host = responseHeaders.host ?? responseHeaders.Host;
    if (result.origin) {
      customOrigin = {
        ...customOrigin,
        domainName: result.origin.host,
        port: result.origin.port ?? 443,
        protocol: result.origin.protocol ?? "https",
        customHeaders: {},
      };
      host = result.origin.host;
    }

    const response: CloudFrontRequest = {
      clientIp,
      method,
      uri: result.internalEvent.rawPath,
      querystring: convertToQueryString(result.internalEvent.query).replace(
        "?",
        "",
      ),
      headers: convertToCloudfrontHeaders({
        ...responseHeaders,
        host,
      }),
      origin: origin?.custom
        ? {
            custom: customOrigin,
          }
        : origin,
    };

    debug("response rewrite", response);

    return response;
  }

  const body = await fromReadableStream(result.body, result.isBase64Encoded);
  const responseHeaders = result.headers;

  const response: CloudFrontRequestResult = {
    status: result.statusCode.toString(),
    statusDescription: "OK",
    headers: convertToCloudfrontHeaders(responseHeaders, true),
    bodyEncoding: result.isBase64Encoded ? "base64" : "text",
    body,
  };

  debug(response);
  return response;
}

export default {
  convertFrom: convertFromCloudFrontRequestEvent,
  convertTo: convertToCloudFrontRequestResult,
  name: "aws-cloudfront",
} as Converter;
