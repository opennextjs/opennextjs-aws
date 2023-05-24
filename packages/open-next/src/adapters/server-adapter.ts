import fs from "node:fs";
import path from "node:path";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEvent,
  CloudFrontRequestEvent,
} from "aws-lambda";
// @ts-ignore
import NextServer from "next/dist/server/next-server.js";
//@ts-ignore
import { getMaybePagePath } from "next/dist/server/require.js";
import { generateUniqueId, loadConfig, setNodeEnv } from "./util.js";
import { isBinaryContentType } from "./binary.js";
import { debug } from "./logger.js";
import type { PublicFiles } from "../build.js";
import { convertFrom, convertTo } from "./event-mapper.js";
import { overrideDefault, overrideReact } from "./require-hooks.js";
import type { WarmerEvent, WarmerResponse } from "./warmer-function.js";

const NEXT_DIR = path.join(__dirname, ".next");
const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
const NODE_MODULES_DIR = path.join(__dirname, "node_modules");
debug({ NEXT_DIR, OPEN_NEXT_DIR });

setNodeEnv();
setNextjsServerWorkingDirectory();
const config = loadConfig(NEXT_DIR);
const htmlPages = loadHtmlPages();
const publicAssets = loadPublicAssets();
initializeNextjsRequireHooks(config);

// Generate a 6 letter unique server ID
const serverId = `server-${generateUniqueId()}`;
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

/////////////
// Handler //
/////////////

export async function handler(
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent
) {
  debug("event", event);

  // Handler warmer
  if ("type" in event) {
    return formatWarmerResponse(event);
  }

  // Parse Lambda event and create Next.js request
  const internalEvent = convertFrom(event);

  // WORKAROUND: Set `x-forwarded-host` header (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-x-forwarded-host-header-aws-specific
  if (internalEvent.headers["x-forwarded-host"]) {
    internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
  }

  // WORKAROUND: public/ static files served by the server function (AWS specific) — https://github.com/serverless-stack/open-next#workaround-public-static-files-served-by-the-server-function-aws-specific
  if (publicAssets.files.includes(internalEvent.rawPath)) {
    return internalEvent.type === "cf"
      ? formatCloudFrontFailoverResponse(event as CloudFrontRequestEvent)
      : formatAPIGatewayFailoverResponse();
  }

  // Process Next.js request
  const reqProps = {
    method: internalEvent.method,
    url: internalEvent.url,
    headers: internalEvent.headers,
    body: internalEvent.body,
    remoteAddress: internalEvent.remoteAddress,
  };
  debug("IncomingMessage constructor props", reqProps);
  const req = new IncomingMessage(reqProps);
  const res = new ServerResponse({ method: reqProps.method });
  setNextjsPrebundledReact(req, config);
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
  if (htmlPages.includes(internalEvent.rawPath) && headers["cache-control"]) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=31536000, must-revalidate";
  }

  return convertTo({
    type: internalEvent.type,
    statusCode,
    headers,
    isBase64Encoded,
    body,
  });
}

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function initializeNextjsRequireHooks(config: any) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react
  if (!isNextjsVersionAtLeast("13.1.3")) return;
  overrideDefault();
  overrideReact(config);
}

function setNextjsPrebundledReact(req: IncomingMessage, config: any) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react

  // "getMaybePagePath" is not present in older version of next.js
  // => use node_modules React
  if (!getMaybePagePath) {
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = undefined;
    return;
  }

  // pages route => use node_modules React
  if (getMaybePagePath(req.url, NEXT_DIR, config.i18n?.locales, false)) {
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = undefined;
    return;
  }

  // app router => use prebundled React
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = config.experimental
    .serverActions
    ? "experimental"
    : "next";
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

function formatAPIGatewayFailoverResponse() {
  return { statusCode: 503 };
}

function formatCloudFrontFailoverResponse(event: CloudFrontRequestEvent) {
  return event.Records[0].cf.request;
}

function formatWarmerResponse(event: WarmerEvent) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ serverId } satisfies WarmerResponse);
    }, event.delay);
  });
}

function isNextjsVersionAtLeast(required: `${number}.${number}.${number}`) {
  const filePath = path.join(NODE_MODULES_DIR, "next", "package.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const version = JSON.parse(json).version;

  const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
  const [reqMajor, reqMinor, reqPatch] = required.split(".").map(Number);
  return (
    major > reqMajor ||
    (major === reqMajor && minor > reqMinor) ||
    (major === reqMajor && minor === reqMinor && patch >= reqPatch)
  );
}

function loadHtmlPages() {
  const filePath = path.join(NEXT_DIR, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([key]) => key);
}

function loadPublicAssets() {
  const filePath = path.join(OPEN_NEXT_DIR, "public-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PublicFiles;
}
