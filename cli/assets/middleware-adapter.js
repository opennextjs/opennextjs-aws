import { default as fetch, Headers, Request, Response } from "node-fetch";
Object.assign(globalThis, {
  Request,
  Response,
  fetch,
  Headers,
  self: {}
});
const index = await (() => import("./middleware.js"))();

export async function handler(event) {
  // Convert CloudFront request to Node request
  const request = event.Records[0].cf.request;
  const { uri, method, headers, querystring, body } = request;
  console.log(uri);
  console.log(request);
  console.log(request.headers);
  const requestHeaders = new Headers();
  for (const [key, values] of Object.entries(headers)) {
    for (const { value } of values) {
      if (value) {
        requestHeaders.append(key, value)
      }
    }
  }
  const host = headers["host"][0].value;
  const qs = querystring.length > 0 ? `?${querystring}` : "";
  const url = new URL(`${uri}${qs}`, `https://${host}`);
  const nodeRequest = new Request(url.toString(), {
    method,
    headers: requestHeaders,
    body: body?.data
      ? body.encoding === "base64"
        ? Buffer.from(body.data, "base64").toString()
        : body.data
      : undefined,
  });

  // Process request
  const response = await index.default(nodeRequest, {
    waitUntil: () => {},
  });

  // WORKAROUND (AWS): pass middleware headers to server
  if (response.headers.get("x-middleware-next") === "1") {
    console.log("== getMiddlewareHeaders ==", response.headers);
    headers["x-op-middleware-request-headers"] = [{
      key: "x-op-middleware-request-headers",
      value: getMiddlewareRequestHeaders(response),
    }];
    headers["x-op-middleware-response-headers"] = [{
      key: "x-op-middleware-response-headers",
      value: getMiddlewareResponseHeaders(response),
    }];
    console.log("== conitnue to origin ==", request)
    return request;
  }

  console.log("== do not hit origin ==", response, {
    status: response.status,
    headers: httpHeadersToCfHeaders(response.headers),
  });
  return {
    status: response.status,
    headers: httpHeadersToCfHeaders(response.headers),
  };
}

function getMiddlewareRequestHeaders(response) {
  const headers = {};
  (response.headers.get("x-middleware-override-headers") || "")
    .split(",")
    .forEach(key => {
      headers[key] = response.headers.get(`x-middleware-request-${key}`)
    });
  console.log("== getMiddlewareRequestHeaders ==", headers);
  return JSON.stringify(headers);
}

function getMiddlewareResponseHeaders(response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (!key.startsWith("x-middleware-")) {
      headers[key] = value;
    }
  });
  console.log("== getMiddlewareResponseHeaders ==", headers);
  return JSON.stringify(headers);
}

function httpHeadersToCfHeaders(httpHeaders) {
  const headers = {};
  httpHeaders.forEach((value, key) => {
    headers[key] = [{ key, value }];
  });
  console.log("== responseHeadersToCloudFrontHeaders ==", headers);
  return headers;
}