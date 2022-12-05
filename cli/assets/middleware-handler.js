import { default as fetch, Headers, Request, Response } from "node-fetch";
Object.assign(globalThis, {
  Request,
  Response,
  fetch,
  Headers,
  self: {}
});
const index = await (() => import("./middleware.js"))();

// TODO
//console.log(self);
//handler({
//  Records: [
//    {
//      cf: {
//        request: {
//          uri: "https://sst.dev/_next/data/5fCVTp6Xr7VQpZ-m8Wxxq/middleware-redirect.json",
//          method: "GET",
//          headers: {
//            host: [{ value: "sst.dev" }]
//          },
//          querystring: "",
//        },
//      }
//    }
//  ]
//}).then((res) => console.log(JSON.stringify(res, null, 2)));

export async function handler(event) {
  // Convert CloudFront request to Node request
  const request = event.Records[0].cf.request;
  const { uri, method, headers, querystring, body } = request;
  console.log(uri);
  console.log(request);
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

  // Build headers
  (response.headers.get("x-middleware-override-headers") || "")
    .split(",")
    .forEach(key => {
      headers[key] = [{
        key,
        value: response.headers.get(`x-middleware-request-${key}`)
      }];
    });

  if (response.headers.get("x-middleware-next") === "1") {
    headers["x-wahaha"] = [{ key: "x-wahaha", value: "wahaha" }];
    headers["wahaha"] = [{ key: "wahaha", value: "wahaha" }];
    console.log("== conitnue to origin ==", request)
    return request;
  }

  console.log("== do not hit origin ==", {
    status: response.status,
    headers,
  });
  return {
    status: response.status,
    headers,
  }
}

/**
 * middleware-fetch
 * 
 * nextresponse [response] {
  size: 0,
  [symbol(body internals)]: {
    body: null,
    stream: null,
    boundary: null,
    disturbed: false,
    error: null
  },
  [symbol(response internals)]: {
    type: 'default',
    url: undefined,
    status: 200,
    statustext: '',
    headers: { 'x-middleware-next': '1' },
    counter: undefined,
    highwatermark: undefined
  },
  [Symbol(internal response)]: {
    cookies: ResponseCookies { _parsed: Map(0) {}, _headers: [Object] },
    url: undefined
  }
}
 */
/**
 * middleware-set-header
 * 
 * NextResponse [Response] {
  size: 0,
  [Symbol(Body internals)]: {
    body: null,
    stream: null,
    boundary: null,
    disturbed: false,
    error: null
  },
  [Symbol(Response internals)]: {
    type: 'default',
    url: undefined,
    status: 200,
    statusText: '',
    headers: {
      'x-hello-from-middleware2': 'hello',
      'x-middleware-next': '1',
      'x-middleware-override-headers': 'x-hello-from-middleware1',
      'x-middleware-request-x-hello-from-middleware1': 'hello'
    },
    counter: undefined,
    highWaterMark: undefined
  },
  [Symbol(internal response)]: {
    cookies: ResponseCookies { _parsed: Map(0) {}, _headers: [Object] },
    url: undefined
  }
}
 */
/**
 * middleware-redirect
 * 
 * Response {
  size: 0,
  [Symbol(Body internals)]: {
    body: null,
    stream: null,
    boundary: null,
    disturbed: false,
    error: null
  },
  [Symbol(Response internals)]: {
    type: 'default',
    url: '',
    status: 307,
    statusText: '',
    headers: { location: 'https://sst.dev/ssr' },
    counter: undefined,
    highWaterMark: undefined
  }
}
 */