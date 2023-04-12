import fs from "node:fs";
import path from "node:path";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontHeaders,
} from "aws-lambda";
// @ts-ignore
import NextServer from "next/dist/server/next-server.js";
import { loadConfig, setNodeEnv } from "./util.js";
import { isBinaryContentType } from "./binary.js";
import { debug } from "./logger.js";
import type { PublicFiles } from "../build.js";

setNodeEnv();
setNextjsServerWorkingDirectory();
const nextDir = path.join(__dirname, ".next");
const openNextDir = path.join(__dirname, ".open-next");
const config = loadConfig(nextDir);
const htmlPages = loadHtmlPages();
const publicAssets = loadPublicAssets();
debug({ nextDir });

// Create a NextServer
const requestHandler = new NextServer.default({
  hostname: "localhost",
  port: Number(process.env.PORT) || 3000,
  // Next.js compression should be disabled because of a bug in the bundled
  // `compression` package — https://github.com/vercel/next.js/issues/11669
  conf: { ...config, compress: false },
  customServer: false,
  dev: false,
  dir: __dirname,
}).getRequestHandler();

const eventParser = {
  apiv2: (event: APIGatewayProxyEventV2) => ({
    get method() {
      return event.requestContext.http.method;
    },
    get rawPath() {
      return event.rawPath;
    },
    get url() {
      const { rawPath, rawQueryString } = event;
      return rawQueryString.length > 0
        ? `${rawPath}?${rawQueryString}`
        : rawPath;
    },
    get body() {
      const { body, isBase64Encoded } = event;
      if (Buffer.isBuffer(body)) {
        return body;
      } else if (typeof body === "string") {
        return Buffer.from(body, isBase64Encoded ? "base64" : "utf8");
      } else if (typeof body === "object") {
        return Buffer.from(JSON.stringify(body));
      }
      return Buffer.from("", "utf8");
    },
    get headers() {
      const { headers: rawHeaders, cookies } = event;

      const headers: Record<string, string> = {};

      if (Array.isArray(cookies)) {
        headers["cookie"] = cookies.join("; ");
      }

      for (const [key, value] of Object.entries(rawHeaders || {})) {
        headers[key.toLowerCase()] = value!;
      }

      return headers;
    },
    get remoteAddress() {
      return event.requestContext.http.sourceIp;
    },
  }),
  cloudfront: (event: CloudFrontRequestEvent) => ({
    get method() {
      return event.Records[0].cf.request.method;
    },
    get rawPath() {
      return event.Records[0].cf.request.uri;
    },
    get url() {
      const { uri, querystring } = event.Records[0].cf.request;
      return querystring.length > 0 ? `${uri}?${querystring}` : uri;
    },
    get body() {
      const { body } = event.Records[0].cf.request;
      if (!body) {
        return Buffer.from("", "utf8");
      }

      return body.encoding === "base64"
        ? Buffer.from(body.data, "base64")
        : Buffer.from(body.data, "utf8");
    },
    get headers() {
      const { headers: rawHeaders } = event.Records[0].cf.request;
      const headers: Record<string, string> = {};

      for (const [key, values] of Object.entries(rawHeaders)) {
        for (const { value } of values) {
          if (value) {
            headers[key] = value;
          }
        }
      }

      return headers;
    },
    get remoteAddress() {
      return event.Records[0].cf.request.clientIp;
    },
  }),
};

/////////////
// Handler //
/////////////

export async function handler(
  event: APIGatewayProxyEventV2 | CloudFrontRequestEvent
) {
  debug("handler event", event);

  // Parse Lambda event and create Next.js request
  const isCloudFrontEvent = (event as CloudFrontRequestEvent).Records?.[0]?.cf;
  const parser = isCloudFrontEvent
    ? eventParser.cloudfront(event as CloudFrontRequestEvent)
    : eventParser.apiv2(event as APIGatewayProxyEventV2);

  // WORKAROUND: public/ static files served by the server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-public-static-files-served-by-the-server-function-aws-specific
  if (publicAssets.files.includes(parser.rawPath)) {
    return isCloudFrontEvent
      ? formatCloudFrontFailoverResponse(event as CloudFrontRequestEvent)
      : formatApiv2FailoverResponse();
  }

  // Process Next.js request
  const reqProps = {
    method: parser.method,
    url: parser.url,
    headers: parser.headers,
    body: parser.body,
    remoteAddress: parser.remoteAddress,
  };
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  await processRequest(req, res);

  // Format Next.js response to Lambda response
  const statusCode = res.statusCode || 200;
  const headers = ServerResponse.headers(res);
  const isBase64Encoded = isBinaryContentType(
    Array.isArray(headers["content-type"])
      ? headers["content-type"][0]
      : headers["content-type"]
  );
  const encoding = isBase64Encoded ? "base64" : "utf8";
  const body = ServerResponse.body(res).toString(encoding);
  debug("ServerResponse data", { statusCode, headers, isBase64Encoded, body });

  // WORKAROUND: `NextServer` does not set cache response headers for HTML pages — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-cache-response-headers-for-html-pages
  if (htmlPages.includes(parser.rawPath) && headers["cache-control"]) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }

  return isCloudFrontEvent
    ? formatCloudFrontResponse({ statusCode, headers, isBase64Encoded, body })
    : formatApiv2Response({ statusCode, headers, isBase64Encoded, body });
}

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function loadHtmlPages() {
  const filePath = path.join(nextDir, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([key]) => key);
}

function loadPublicAssets() {
  const filePath = path.join(openNextDir, "public-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PublicFiles;
}

async function processRequest(req: IncomingMessage, res: ServerResponse) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    await requestHandler(req, res);
  } catch (e: any) {
    console.error("NextJS request failed.", e);

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          message: "Server failed to respond.",
          details: e,
        },
        null,
        2
      )
    );
  }
}

function formatApiv2Response({
  statusCode,
  headers: rawHeaders,
  body,
  isBase64Encoded,
}: {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded: boolean;
}) {
  const headers: Record<string, string> = {};
  Object.entries(rawHeaders)
    .filter(([key]) => key.toLowerCase() !== "set-cookie")
    .forEach(([key, value]) => {
      if (value === null) {
        headers[key] = "";
        return;
      }
      headers[key] = Array.isArray(value) ? value.join(", ") : value.toString();
    });
  const response: APIGatewayProxyResultV2 = {
    statusCode,
    headers,
    cookies: rawHeaders["set-cookie"] as string[] | undefined,
    body,
    isBase64Encoded,
  };
  debug(response);
  return response;
}

function formatApiv2FailoverResponse() {
  return { statusCode: 503 };
}

function formatCloudFrontResponse({
  statusCode,
  headers: rawHeaders,
  body,
  isBase64Encoded,
}: {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded: boolean;
}) {
  const headers: CloudFrontHeaders = {};
  Object.entries(rawHeaders)
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
    status: statusCode.toString(),
    statusDescription: "OK",
    headers,
    bodyEncoding: isBase64Encoded ? "base64" : "text",
    body,
  };
  debug(response);
  return response;
}

function formatCloudFrontFailoverResponse(event: CloudFrontRequestEvent) {
  return event.Records[0].cf.request;
}
