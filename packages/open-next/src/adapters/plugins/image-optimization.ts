import { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import { Writable } from "node:stream";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { APIGatewayProxyEventHeaders } from "aws-lambda";
import { NextConfig } from "next/dist/server/config-shared";
import { imageOptimizer } from "next/dist/server/image-optimizer";
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";

import { awsLogger, debug, error } from "../logger.js";

// Expected environment variables
const { BUCKET_NAME, BUCKET_KEY_PREFIX } = process.env;

const s3Client = new S3Client({ logger: awsLogger });

export async function optimizeImage(
  headers: APIGatewayProxyEventHeaders,
  imageParams: any,
  nextConfig: NextConfig,
) {
  const result = await imageOptimizer(
    // @ts-ignore
    { headers },
    {}, // res object is not necessary as it's not actually used.
    imageParams,
    nextConfig,
    false, // not in dev mode
    downloadHandler,
  );
  debug("optimized result", result);
  return result;
}

async function downloadHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  url: NextUrlWithParsedQuery,
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
        error("Failed to get image", err);
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
      const keyPrefix = BUCKET_KEY_PREFIX?.replace(/^\/|\/$/g, "");
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: keyPrefix
            ? keyPrefix + "/" + url.href.replace(/^\//, "")
            : url.href.replace(/^\//, ""),
        }),
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
    error("Failed to download image", e);
    throw e;
  }
}
