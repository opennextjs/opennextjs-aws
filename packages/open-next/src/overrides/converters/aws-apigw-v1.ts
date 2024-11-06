import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import type { InternalEvent, InternalResult } from "types/open-next";
import type { Converter } from "types/overrides";
import { fromReadableStream } from "utils/stream";

import { debug } from "../../adapters/logger";
import { removeUndefinedFromQuery } from "./utils";

function normalizeAPIGatewayProxyEventHeaders(
  event: APIGatewayProxyEvent,
): Record<string, string> {
  event.multiValueHeaders;
  const headers: Record<string, string> = {};

  for (const [key, values] of Object.entries(event.multiValueHeaders || {})) {
    if (values) {
      headers[key.toLowerCase()] = values.join(",");
    }
  }
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value) {
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

function normalizeAPIGatewayProxyEventQueryParams(
  event: APIGatewayProxyEvent,
): string {
  // Note that the same query string values are returned in both
  // "multiValueQueryStringParameters" and "queryStringParameters".
  // We only need to use one of them.
  // For example:
  //   "?name=foo" appears in the event object as
  //   {
  //     ...
  //     queryStringParameters: { name: 'foo' },
  //     multiValueQueryStringParameters: { name: [ 'foo' ] },
  //     ...
  //   }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(
    event.multiValueQueryStringParameters || {},
  )) {
    if (value !== undefined) {
      for (const v of value) {
        params.append(key, v);
      }
    }
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

async function convertFromAPIGatewayProxyEvent(
  event: APIGatewayProxyEvent,
): Promise<InternalEvent> {
  const { path, body, httpMethod, requestContext, isBase64Encoded } = event;
  return {
    type: "core",
    method: httpMethod,
    rawPath: path,
    url: path + normalizeAPIGatewayProxyEventQueryParams(event),
    body: Buffer.from(body ?? "", isBase64Encoded ? "base64" : "utf8"),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
    remoteAddress: requestContext.identity.sourceIp,
    query: removeUndefinedFromQuery(
      event.multiValueQueryStringParameters ?? {},
    ),
    cookies:
      event.multiValueHeaders?.cookie?.reduce((acc, cur) => {
        const [key, value] = cur.split("=");
        return { ...acc, [key]: value };
      }, {}) ?? {},
  };
}

async function convertToApiGatewayProxyResult(
  result: InternalResult,
): Promise<APIGatewayProxyResult> {
  const headers: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};
  Object.entries(result.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      multiValueHeaders[key] = value;
    } else {
      if (value === null) {
        headers[key] = "";
        return;
      }
      headers[key] = value;
    }
  });

  const body = await fromReadableStream(result.body, result.isBase64Encoded);

  const response: APIGatewayProxyResult = {
    statusCode: result.statusCode,
    headers,
    body,
    isBase64Encoded: result.isBase64Encoded,
    multiValueHeaders,
  };
  debug(response);
  return response;
}

export default {
  convertFrom: convertFromAPIGatewayProxyEvent,
  convertTo: convertToApiGatewayProxyResult,
  name: "aws-apigw-v1",
} as Converter;
