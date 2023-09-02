import path from "node:path";

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";

import { convertFrom, convertTo, InternalEvent } from "./event-mapper.js";
import { debug, error } from "./logger.js";
import {
  postProcessResponse,
  processInternalEvent,
} from "./plugins/routing/default.js";
import { handler as serverHandler } from "./plugins/serverHandler.js";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import {
  generateUniqueId,
  loadBuildId,
  loadConfig,
  loadPublicAssets,
  setNodeEnv,
} from "./util.js";
import type { WarmerEvent, WarmerResponse } from "./warmer-function.js";

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
export const config = loadConfig(NEXT_DIR);

debug({ NEXT_DIR, OPEN_NEXT_DIR });

const buildId = loadBuildId(NEXT_DIR);
setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

const publicAssets = loadPublicAssets(OPEN_NEXT_DIR);
// Generate a 6 letter unique server ID
const serverId = `server-${generateUniqueId()}`;

/////////////
// Handler //
/////////////

export async function handler(
  event:
    | APIGatewayProxyEventV2
    | CloudFrontRequestEvent
    | APIGatewayProxyEvent
    | WarmerEvent,
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
  // TODO: This is no longer required if each top-level file and folder in "/public"
  //       is handled by a separate cache behavior. Leaving here for backward compatibility.
  //       Remove this on next major release.
  if (publicAssets.files.includes(internalEvent.rawPath)) {
    return internalEvent.type === "cf"
      ? formatCloudFrontFailoverResponse(event as CloudFrontRequestEvent)
      : formatAPIGatewayFailoverResponse();
  }

  const preprocessResult = await processInternalEvent(internalEvent);
  if ("type" in preprocessResult) {
    return convertTo(preprocessResult);
  } else {
    const {
      req,
      res,
      isExternalRewrite,
      internalEvent: overwrittenInternalEvent,
    } = preprocessResult;

    await processRequest(req, res, overwrittenInternalEvent, isExternalRewrite);

    const internalResult = await postProcessResponse({
      internalEvent: overwrittenInternalEvent,
      req,
      res,
      isExternalRewrite,
    });

    return convertTo(internalResult);
  }
}

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = buildId;
}

async function processRequest(
  req: IncomingMessage,
  res: ServerResponse,
  internalEvent: InternalEvent,
  isExternalRewrite?: boolean,
) {
  // @ts-ignore
  // Next.js doesn't parse body if the property exists
  // https://github.com/dougmoscrop/serverless-http/issues/227
  delete req.body;

  try {
    // `serverHandler` is replaced at build time depending on user's
    // nextjs version to patch Nextjs 13.4.x and future breaking changes.
    await serverHandler(req, res, {
      internalEvent,
      buildId,
      isExternalRewrite,
    });
  } catch (e: any) {
    error("NextJS request failed.", e);

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          message: "Server failed to respond.",
          details: e,
        },
        null,
        2,
      ),
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
  return new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId } satisfies WarmerResponse);
    }, event.delay);
  });
}
