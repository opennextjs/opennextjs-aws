import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { parseCookies } from "http/util";
import type { Converter, InternalEvent, InternalResult } from "types/open-next";

import { debug } from "../adapters/logger";
import { convertToQuery } from "../core/routing/util";
import { removeUndefinedFromQuery } from "./utils";

// Not sure which one is reallly needed as this is not documented anywhere but server actions redirect are not working without this, it causes a 500 error from cloudfront itself with a 'x-amzErrortype: InternalFailure' header
const CloudFrontBlacklistedHeaders = [
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
  /x-amzn-(.*)/,
  /x-edge-(.*)/,
  "x-cache",
  "x-forwarded-proto",
  "x-real-ip",
  "set-cookie",
  "age",
  "via",
];

function normalizeAPIGatewayProxyEventV2Body(
  event: APIGatewayProxyEventV2,
): Buffer {
  const { body, isBase64Encoded } = event;
  if (Buffer.isBuffer(body)) {
    return body;
  } else if (typeof body === "string") {
    return Buffer.from(body, isBase64Encoded ? "base64" : "utf8");
  } else if (typeof body === "object") {
    return Buffer.from(JSON.stringify(body));
  } else {
    return Buffer.from("", "utf8");
  }
}

function normalizeAPIGatewayProxyEventV2Headers(
  event: APIGatewayProxyEventV2,
): Record<string, string> {
  const { headers: rawHeaders, cookies } = event;

  const headers: Record<string, string> = {};

  if (Array.isArray(cookies)) {
    headers["cookie"] = cookies.join("; ");
  }

  for (const [key, value] of Object.entries(rawHeaders || {})) {
    headers[key.toLowerCase()] = value!;
  }

  return headers;
}

async function convertFromAPIGatewayProxyEventV2(
  event: APIGatewayProxyEventV2,
): Promise<InternalEvent> {
  const { rawPath, rawQueryString, requestContext } = event;
  return {
    type: "core",
    method: requestContext.http.method,
    rawPath,
    url: rawPath + (rawQueryString ? `?${rawQueryString}` : ""),
    body: normalizeAPIGatewayProxyEventV2Body(event),
    headers: normalizeAPIGatewayProxyEventV2Headers(event),
    remoteAddress: requestContext.http.sourceIp,
    query: removeUndefinedFromQuery(convertToQuery(rawQueryString)),
    cookies:
      event.cookies?.reduce((acc, cur) => {
        const [key, value] = cur.split("=");
        return { ...acc, [key]: value };
      }, {}) ?? {},
  };
}

function convertToApiGatewayProxyResultV2(
  result: InternalResult,
): APIGatewayProxyResultV2 {
  const headers: Record<string, string> = {};
  Object.entries(result.headers)
    .filter(
      ([key]) =>
        !CloudFrontBlacklistedHeaders.some((header) =>
          typeof header === "string" ? header === key : header.test(key),
        ),
    )
    .forEach(([key, value]) => {
      if (value === null || value === undefined) {
        headers[key] = "";
        return;
      }
      headers[key] = Array.isArray(value) ? value.join(", ") : `${value}`;
    });

  const response: APIGatewayProxyResultV2 = {
    statusCode: result.statusCode,
    headers,
    cookies: parseCookies(result.headers["set-cookie"]),
    body: result.body,
    isBase64Encoded: result.isBase64Encoded,
  };
  debug(response);
  return response;
}

export default {
  convertFrom: convertFromAPIGatewayProxyEventV2,
  convertTo: convertToApiGatewayProxyResultV2,
  name: "aws-apigw-v2",
} as Converter;
