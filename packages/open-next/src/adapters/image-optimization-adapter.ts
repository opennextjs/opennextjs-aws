import path from "node:path";
import https from "node:https";
import { Writable } from "node:stream";
import { IncomingMessage, ServerResponse } from "node:http";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventQueryStringParameters,
} from "aws-lambda";
// @ts-ignore
import { defaultConfig } from "next/dist/server/config-shared";
// @ts-ignore
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";
import {
  imageOptimizer,
  ImageOptimizerCache,
  // @ts-ignore
} from "next/dist/server/image-optimizer";
import { loadConfig, setNodeEnv } from "./util.js";
import { debug } from "./logger.js";

setNodeEnv();
const bucketName = process.env.BUCKET_NAME;
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
  bucketName,
  nextConfig,
});

/////////////
// Handler //
/////////////

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  // Images are handled via header and query param information.
  debug("handler event", event);
  const { headers: rawHeaders, queryStringParameters: queryString } = event;

  try {
    const headers = normalizeHeaderKeysToLowercase(rawHeaders);
    ensureBucketExists();
    const imageParams = validateImageParams(headers, queryString);
    const result = await optimizeImage(headers, imageParams);

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
    {} as APIGatewayProxyEventHeaders
  );
}

function ensureBucketExists() {
  if (!bucketName) {
    throw new Error("Bucket name must be defined!");
  }
}

function validateImageParams(
  headers: APIGatewayProxyEventHeaders,
  queryString?: APIGatewayProxyEventQueryStringParameters
) {
  // Next.js checks if external image URL matches the
  // `images.remotePatterns`
  const imageParams = ImageOptimizerCache.validateParams(
    { headers },
    queryString,
    nextConfig,
    false
  );
  debug("image params", imageParams);
  if ("errorMessage" in imageParams) {
    throw new Error(imageParams.errorMessage);
  }
  return imageParams;
}

async function optimizeImage(
  headers: APIGatewayProxyEventHeaders,
  imageParams: any
) {
  const result = await imageOptimizer(
    { headers },
    {}, // res object is not necessary as it's not actually used.
    imageParams,
    nextConfig,
    false, // not in dev mode
    downloadHandler
  );
  debug("optimized result", result);
  return result;
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

async function downloadHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  url: NextUrlWithParsedQuery
) {
  // downloadHandler is called by Next.js. We don't call this function
  // directly.
  debug("downloadHandler url", url);

  // Reads the output from the Writable and writes to the response
  const pipeRes = (w: Writable, res: ServerResponse) => {
    w.pipe(res)
      .once("close", () => {
        res.statusCode = 200;
        res.end();
      })
      .once("error", (err) => {
        console.error("Failed to get image", { err });
        res.statusCode = 400;
        res.end();
      });
  };

  try {
    // Case 1: remote image URL => download the image from the URL
    if (url.href.toLowerCase().match(/^https?:\/\//)) {
      pipeRes(https.get(url), res);
    }
    // Case 2: local image => download the image from S3
    else {
      // Download image from S3
      // note: S3 expects keys without leading `/`
      const client = new S3Client({});
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: url.href.replace(/^\//, ""),
        })
      );

      if (!response.Body) {
        throw new Error("Empty response body from the S3 request.");
      }

      // @ts-ignore
      pipeRes(response.Body, res);

      // Respect the bucket file's content-type and cache-control
      // imageOptimizer will use this to set the results.maxAge
      if (response.ContentType) {
        res.setHeader("Content-Type", response.ContentType);
      }
      if (response.CacheControl) {
        res.setHeader("Cache-Control", response.CacheControl);
      }
    }
  } catch (e: any) {
    console.error("Failed to download image", e);
    throw e;
  }
}
