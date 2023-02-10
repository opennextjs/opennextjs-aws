import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontHeaders,
  CloudFrontRequest,
} from "aws-lambda"
import type { Redirect, Rewrite } from "next/dist/lib/load-custom-routes.js";
import { match, compile } from "path-to-regexp";

// @ts-expect-error
const index = await (async () => { try { return import("./middleware.js") } catch { } })();

// @ts-expect-error
const redirectsJson: Redirect[] = (await (() => import("./redirects.json"))()).default;

// @ts-expect-error
const rewritesJson: Rewrite[] = (await (() => import("./rewrites.json"))()).default;

const redirectMatchers = redirectsJson.map(r => match(r.source, { strict: true }));
const redirectCompilers = redirectsJson.map(r => compile(r.destination.replace(/http(s)?:\/\//, "http$1/")));

const rewriteMatchers = rewritesJson.map(r => match(r.source, { strict: true }));
const rewriteCompilers = rewritesJson.map(r => compile(r.destination.replace(/http(s)?:\/\//, "http$1/")))

export async function handler(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const { uri, method, headers, querystring, body } = request;
  console.log(uri);
  console.log(request);
  console.log(request.headers);

  // Convert CloudFront request to Node request
  const requestHeaders = new Headers();
  for (const [key, values] of Object.entries(headers)) {
    for (const { value } of values) {
      if (value) {
        requestHeaders.append(key, value)
      }
    }
  }
  const host = headers["host"][0].value;

  for (const [i, matcher] of redirectMatchers.entries()) {
    const match = matcher(uri);
    if (!match) continue;

    const destination = `https://${host}${redirectCompilers[i](match.params).replace(/^http(s)?\//, "http$1://")}`;

    console.log(`redirected from ${uri} to ${destination}`)

    return {
      status: redirectsJson[i].permanent ? "301" : "302",
      headers: {
        "location": [{ key: "location", value: destination }]
      }
    }
  }

  for (const [i, matcher] of rewriteMatchers.entries()) {
    const match = matcher(uri);
    if (!match) continue;

    const rawDestination = rewriteCompilers[i](match.params).replace(/^http(s)?\//, "http$1://");
    const destination = /^https?:\/\//.test(rawDestination) ? rawDestination : `https://${host}${rawDestination}`

    console.log(`rewrote from ${uri} to ${destination}`)

    return handleRewrite(request, requestHeaders, destination)
  }

  if (!index?.default) return request;

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

  const middlewareRewrite = response.headers.get("x-middleware-rewrite")
  if (middlewareRewrite)
    return handleRewrite(request, requestHeaders, middlewareRewrite)

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

async function handleRewrite(request: CloudFrontRequest, requestHeaders: Headers, destination: string): Promise<CloudFrontRequestResult> {
  if (!destination) return;

  const url = new URL(destination)

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