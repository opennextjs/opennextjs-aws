import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyEvent,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontHeaders,
  APIGatewayProxyResult,
} from "aws-lambda";

type InternalEvent = {
  readonly type: "v1" | "v2" | "cf";
  readonly method: string;
  readonly rawPath: string;
  readonly url: string;
  readonly body: Buffer;
  readonly headers: Record<string, string>;
  readonly remoteAddress: string;
};

type InternalResult = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded: boolean;
};

export function isAPIGatewayProxyEventV2(
  event: any
): event is APIGatewayProxyEventV2 {
  return event.version === "2.0";
}

export function isAPIGatewayProxyEvent(
  event: any
): event is APIGatewayProxyEvent {
  return event.version === undefined && !isCloudFrontRequestEvent(event);
}

export function isCloudFrontRequestEvent(
  event: any
): event is CloudFrontRequestEvent {
  return event.Records !== undefined;
}

function normalizeAPIGatewayProxyEventV2Headers(
  event: APIGatewayProxyEventV2
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.headers)) {
    if (value === undefined) continue;
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function convertFromAPIGatewayProxyEventV2(
  event: APIGatewayProxyEventV2
): InternalEvent {
  return {
    type: "v2",
    method: event.requestContext.http.method,
    rawPath: event.rawPath,
    url:
      event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ""),
    body: Buffer.from(
      event.body ?? "",
      event.isBase64Encoded ? "base64" : "utf8"
    ),
    headers: normalizeAPIGatewayProxyEventV2Headers(event),
    remoteAddress: event.requestContext.http.sourceIp,
  };
}

function normalizeCloudFrontRequestEventHeaders(
  rawHeaders: CloudFrontHeaders
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

function normalizeAPIGatewayProxyEventQueryParams(
  event: APIGatewayProxyEvent
): string {
  const params = new URLSearchParams();
  if (event.multiValueQueryStringParameters) {
    for (const [key, value] of Object.entries(
      event.multiValueQueryStringParameters
    )) {
      if (value !== undefined) {
        for (const v of value) {
          params.append(key, v);
        }
      }
    }
  }
  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) {
        params.append(key, value);
      }
    }
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function normalizeAPIGatewayProxyEventHeaders(
  event: APIGatewayProxyEvent
): Record<string, string> {
  event.multiValueHeaders;
  const headers: Record<string, string> = {};

  for (const [key, values] of Object.entries(event.multiValueHeaders)) {
    if (values) {
      headers[key.toLowerCase()] = values.join(",");
    }
  }
  for (const [key, value] of Object.entries(event.headers)) {
    if (value) {
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

function convertFromCloudFrontRequestEvent(
  event: CloudFrontRequestEvent
): InternalEvent {
  const request = event.Records[0].cf.request;
  return {
    type: "cf",
    method: request.method,
    rawPath: request.uri,
    url: request.uri + (request.querystring ? `?${request.querystring}` : ""),
    body: Buffer.from(
      request.body?.data ?? "",
      request.body?.encoding === "base64" ? "base64" : "utf8"
    ),
    headers: normalizeCloudFrontRequestEventHeaders(request.headers),
    remoteAddress: request.clientIp,
  };
}

function convertFromAPIGatewayProxyEvent(
  event: APIGatewayProxyEvent
): InternalEvent {
  return {
    type: "v1",
    method: event.httpMethod,
    rawPath: event.path,
    url: event.path + normalizeAPIGatewayProxyEventQueryParams(event),
    body: Buffer.from(
      event.body ?? "",
      event.isBase64Encoded ? "base64" : "utf8"
    ),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
    remoteAddress: event.requestContext.identity.sourceIp,
  };
}

export function convertFrom(
  event: APIGatewayProxyEventV2 | APIGatewayProxyEvent | CloudFrontRequestEvent
): InternalEvent {
  if (isCloudFrontRequestEvent(event)) {
    return convertFromCloudFrontRequestEvent(event);
  } else if (isAPIGatewayProxyEventV2(event)) {
    return convertFromAPIGatewayProxyEventV2(event);
  } else if (isAPIGatewayProxyEvent(event)) {
    return convertFromAPIGatewayProxyEvent(event);
  }
  throw new Error("Unsupported event type");
}

export function convertTo(
  event: InternalEvent,
  result: InternalResult
): APIGatewayProxyResultV2 | APIGatewayProxyResult | CloudFrontRequestResult {
  if (event.type === "v2") {
    return createApiGatewayProxyResultV2(result);
  } else if (event.type === "v1") {
    return createApiGatewayProxyResult(result);
  } else if (event.type === "cf") {
    return createCloudFrontRequestResult(result);
  }
  throw new Error("Unsupported event type");
}

function createApiGatewayProxyResultV2(
  result: InternalResult
): APIGatewayProxyResultV2 {
  const headers: Record<string, string> = {};
  Object.entries(result.headers)
    .filter(([key]) => key.toLowerCase() !== "set-cookie")
    .forEach(([key, value]) => {
      if (value === null) {
        headers[key] = "";
        return;
      }
      headers[key] = Array.isArray(value) ? value.join(", ") : value.toString();
    });
  const response: APIGatewayProxyResultV2 = {
    statusCode: result.statusCode,
    headers,
    cookies: result.headers["set-cookie"] as string[] | undefined,
    body: result.body,
    isBase64Encoded: result.isBase64Encoded,
  };
  return response;
}

function createApiGatewayProxyResult(
  result: InternalResult
): APIGatewayProxyResult {
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
  const response: APIGatewayProxyResult = {
    statusCode: result.statusCode,
    headers,
    body: result.body,
    isBase64Encoded: result.isBase64Encoded,
    multiValueHeaders,
  };
  return response;
}

function createCloudFrontRequestResult(
  result: InternalResult
): CloudFrontRequestResult {
  const headers: CloudFrontHeaders = {};
  Object.entries(result.headers)
    .filter(([key]) => key.toLowerCase() !== "content-length")
    .forEach(([key, value]) => {
      headers[key] = [
        ...(headers[key] || []),
        ...(Array.isArray(value)
          ? value.map((v) => ({ key, value: v }))
          : [{ key, value: value.toString() }]),
      ];
    });
  const response: CloudFrontRequestResult = {
    status: result.statusCode.toString(),
    statusDescription: "OK",
    headers,
    bodyEncoding: result.isBase64Encoded ? "base64" : "text",
    body: result.body,
  };
  return response;
}
