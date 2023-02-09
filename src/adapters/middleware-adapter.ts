import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontHeaders
} from "aws-lambda"

// @ts-ignore
const index = await (() => import("./middleware.js"))();

export async function handler(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const { uri, method, headers, querystring, body } = request;
  console.log(uri);
  console.log(request);
  console.log(request.headers);

  // Convert CloudFront request to Node request
  // @ts-ignore Types has not been added for Node 18 native fetch API
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
    waitUntil: () => { },
  });
  console.log("middleware response header", response.headers);

  // WORKAROUND: Pass headers from middleware function to server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-pass-headers-from-middleware-function-to-server-function-aws-specific
  if (response.headers.get("x-middleware-next") === "1") {
    headers["x-op-middleware-request-headers"] = [{
      key: "x-op-middleware-request-headers",
      value: getMiddlewareRequestHeaders(response),
    }];
    headers["x-op-middleware-response-headers"] = [{
      key: "x-op-middleware-response-headers",
      value: getMiddlewareResponseHeaders(response),
    }];
    return request;
  }

  if (response.headers.get("x-middleware-rewrite")) {
    // const { pathname, search } = new URL(response.headers.get("x-middleware-rewrite"));
    // request.uri = pathname;
    // if (search) request.querystring = search.slice(1);
    // return request;

    const url = new URL(response.headers.get("x-middleware-rewrite"))

    const res = await fetch(url.href, {
      method: request.method,
      headers: { ...requestHeaders, host: url.host }
    })
    const buffer = Buffer.from(await res.arrayBuffer())
    console.log("rewrite response headers", res.headers)
    const filteredResHeaders = filteredCfHeaders(res.headers)
    console.log("filtered headers", filteredResHeaders)

    return {
      status: String(res.status),
      headers: filteredResHeaders,
      body: buffer.toString("base64"),
      bodyEncoding: "base64"
    }
  }

  return {
    status: response.status,
    headers: httpHeadersToCfHeaders(response.headers),
  };
}

function filteredCfHeaders(httpHeaders: Headers): CloudFrontHeaders {
  const blacklistedHeaders = [
    /^content-length$/,
    /^content-encoding$/,
    /^transfer-encoding$/,
    /^via$/,
    /^host$/,
    /^connection$/,
    /^expect$/,
    /^keep-alive$/,
    /^proxy-/,
    /^trailer$/,
    /^upgrade$/,
    /^x-accel-/,
    /^x-amz-cf-/,
    /^x-amzn-/,
    /^x-cache$/,
    /^x-edge-/,
    /^x-forwarded-proto$/,
    /^x-real-ip$/,
  ]

  const cfHeaders = httpHeadersToCfHeaders(httpHeaders)
  return Object.fromEntries(Object.entries(cfHeaders).filter(([k]) => !blacklistedHeaders.some(h => h.test(k))))
}

function getMiddlewareRequestHeaders(response: { headers: Headers }) {
  const headers: Record<string, string | undefined> = {};
  (response.headers.get("x-middleware-override-headers") || "")
    .split(",")
    .filter(Boolean)
    .forEach((key: string) => {
      headers[key] = response.headers.get(`x-middleware-request-${key}`) ?? undefined
    });
  console.log("getMiddlewareRequestHeaders", headers);
  return JSON.stringify(headers);
}

function getMiddlewareResponseHeaders(response: { headers: Headers }) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    if (!key.startsWith("x-middleware-")) {
      headers[key] = value;
    }
  });
  console.log("getMiddlewareResponseHeaders", headers);
  return JSON.stringify(headers);
}

function httpHeadersToCfHeaders(httpHeaders: Headers) {
  const headers: CloudFrontHeaders = {};
  httpHeaders.forEach((value: string, key: string) => {
    headers[key] = [{ key, value }];
  });
  console.log("httpHeadersToCfHeaders", headers);
  return headers;
}