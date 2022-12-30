import fs from "node:fs";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import slsHttp from "serverless-http"
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda"
// @ts-ignore
import NextServer from "next/dist/server/next-server.js";
import { loadConfig } from "./util.js"

const nextDir = path.join(__dirname, ".next");
const config = loadConfig(nextDir);
const htmlPages = loadHtmlPages();
console.log({ nextDir });

// Create a NextServer
const requestHandler = new NextServer.default({
  // Next.js compression should be disabled because of a bug in the bundled
  // `compression` package — https://github.com/vercel/next.js/issues/11669
  conf: { ...config, compress: false },
  customServer: false,
  dev: false,
  dir: __dirname,
  // "minimalMode" controls:
  //  - Rewrites and redirects
  //  - Headers
  //  - Middleware
  //  - SSG cache
  minimalMode: true,
}).getRequestHandler();

// Create a HTTP server invoking the NextServer
const server = slsHttp(
  async (req: IncomingMessage, res: ServerResponse) => {
    await requestHandler(req, res).catch((e: any) => {
      console.error("NextJS request failed.")
      console.error(e)

      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({
        message: "Server failed to respond.",
        details: e,
      }, null, 2))
    })
  },
  {
    binary: true,
    provider: "aws",
    // TODO: add support for basePath
    //basePath: process.env.NEXTJS_LAMBDA_BASE_PATH,
  },
);

/////////////
// Handler //
/////////////

export async function handler(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  console.log(event)

  // WORKAROUND: Pass headers from middleware function to server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-pass-headers-from-middleware-function-to-server-function-aws-specific
  const middlewareRequestHeaders = JSON.parse(
    event.headers["x-op-middleware-request-headers"] || "{}"
  );
  event.headers = { ...event.headers, ...middlewareRequestHeaders };

  // Invoke NextServer
  const response: APIGatewayProxyResultV2 = await server(event, context);

  // WORKAROUND: `NextServer` does not set cache response headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-response-headers-for-html-pages
  if (htmlPages.includes(event.rawPath) && !response.headers?.["cache-control"]) {
    response.headers!["cache-control"] = "public, max-age=0, s-maxage=31536000, must-revalidate";
  }

  // WORKAROUND: Pass headers from middleware function to server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-pass-headers-from-middleware-function-to-server-function-aws-specific
  const middlewareResponseHeaders = JSON.parse(
    event.headers["x-op-middleware-response-headers"] || "{}"
  );
  response.headers = { ...response.headers, ...middlewareResponseHeaders };

  console.log("response headers", response.headers);

  return response;
}

//////////////////////
// Helper functions //
//////////////////////

function loadHtmlPages() {
  const filePath = path.join(nextDir, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([key]) => key);
}

//const createApigHandler = () => {
//  const config = loadConfig();
//  const requestHandler = new NextServer(config).getRequestHandler();
//
//  return async (event) => {
//    const request = convertApigRequestToNext(event);
//    const response = await requestHandler(request);
//    return convertNextResponseToApig(response);
//  };
//};
//
//export const handler = createApigHandler();

//function convertApigRequestToNext(event) {
//  let host = event.headers["x-forwarded-host"] || event.headers.host;
//  let search = event.rawQueryString.length ? `?${event.rawQueryString}` : "";
//  let scheme = "https";
//  let url = new URL(event.rawPath + search, `${scheme}://${host}`);
//  let isFormData = event.headers["content-type"]?.includes(
//    "multipart/form-data"
//  );
//
//  // Build headers
//  const headers = new Headers();
//  for (let [header, value] of Object.entries(event.headers)) {
//    if (value) {
//      headers.append(header, value);
//    }
//  }
//
//  return new Request(url.href, {
//    method: event.requestContext.http.method,
//    headers,
//    body:
//      event.body && event.isBase64Encoded
//        ? isFormData
//          ? Buffer.from(event.body, "base64")
//          : Buffer.from(event.body, "base64").toString()
//        : event.body,
//  });
//}
//
//async function convertNextResponseToApig(response) {
//  // Build cookies
//  // note: AWS API Gateway will send back set-cookies outside of response headers.
//  const cookies = [];
//  for (let [key, values] of Object.entries(response.headers.raw())) {
//    if (key.toLowerCase() === "set-cookie") {
//      for (let value of values) {
//        cookies.push(value);
//      }
//    }
//  }
//
//  if (cookies.length) {
//    response.headers.delete("Set-Cookie");
//  }
//
//  return {
//    statusCode: response.status,
//    headers: Object.fromEntries(response.headers.entries()),
//    cookies,
//    body: await response.text(),
//  };
//}
