import path from "node:path";

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventQueryStringParameters,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
// @ts-ignore
import { defaultConfig } from "next/dist/server/config-shared";
import {
  ImageOptimizerCache,
  // @ts-ignore
} from "next/dist/server/image-optimizer";

// @ts-ignore
import { loadConfig } from "./config/util.js";
import { debug } from "./logger.js";
import { optimizeImage } from "./plugins/image-optimization.js";
import { setNodeEnv } from "./util.js";

// Expected environment variables
const { BUCKET_NAME } = process.env;

setNodeEnv();
const nextDir = path.join(__dirname, ".next");
const config = loadConfig(nextDir);
const nextConfig = {
  ...defaultConfig,
  images: {
    ...defaultConfig.images,
    ...config.images,
  },
};
debug("Init config", {
  nextDir,
  BUCKET_NAME,
  nextConfig,
});

/////////////
// Handler //
/////////////

export async function handler(
  event: APIGatewayProxyEventV2 | APIGatewayProxyEvent,
): Promise<APIGatewayProxyResultV2> {
  // Images are handled via header and query param information.
  debug("handler event", event);
  const { headers: rawHeaders, queryStringParameters: queryString } = event;

  try {
    const headers = normalizeHeaderKeysToLowercase(rawHeaders);
    ensureBucketExists();
    const imageParams = validateImageParams(
      headers,
      queryString === null ? undefined : queryString,
    );
    const result = await optimizeImage(headers, imageParams, nextConfig);

    return buildSuccessResponse(result);
  } catch (e: any) {
    return buildFailureResponse(e);
  }
}

//////////////////////
// Helper functions //
//////////////////////

function normalizeHeaderKeysToLowercase(headers: APIGatewayProxyEventHeaders) {
  // Make header keys lowercase to ensure integrity
  return Object.entries(headers).reduce(
    (acc, [key, value]) => ({ ...acc, [key.toLowerCase()]: value }),
    {} as APIGatewayProxyEventHeaders,
  );
}

function ensureBucketExists() {
  if (!BUCKET_NAME) {
    throw new Error("Bucket name must be defined!");
  }
}

function validateImageParams(
  headers: APIGatewayProxyEventHeaders,
  queryString?: APIGatewayProxyEventQueryStringParameters,
) {
  // Next.js checks if external image URL matches the
  // `images.remotePatterns`
  const imageParams = ImageOptimizerCache.validateParams(
    // @ts-ignore
    { headers },
    queryString,
    nextConfig,
    false,
  );
  debug("image params", imageParams);
  if ("errorMessage" in imageParams) {
    throw new Error(imageParams.errorMessage);
  }
  return imageParams;
}

function buildSuccessResponse(result: any) {
  return {
    statusCode: 200,
    body: result.buffer.toString("base64"),
    isBase64Encoded: true,
    headers: {
      Vary: "Accept",
      "Cache-Control": `public,max-age=${result.maxAge},immutable`,
      "Content-Type": result.contentType,
    },
  };
}

function buildFailureResponse(e: any) {
  debug(e);
  return {
    statusCode: 500,
    headers: {
      Vary: "Accept",
      // For failed images, allow client to retry after 1 minute.
      "Cache-Control": `public,max-age=60,immutable`,
      "Content-Type": "application/json",
    },
    body: e?.message || e?.toString() || e,
  };
}
