import { createHash } from "node:crypto";
import {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import https from "node:https";
import path from "node:path";
import { Writable } from "node:stream";

import { loadBuildId, loadConfig } from "config/util.js";
import { OpenNextNodeResponse, StreamCreator } from "http/openNextResponse.js";
// @ts-ignore
import { defaultConfig } from "next/dist/server/config-shared";
import {
  ImageOptimizerCache,
  // @ts-ignore
} from "next/dist/server/image-optimizer";
// @ts-ignore
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";
import { InternalEvent, InternalResult } from "types/open-next.js";

import { createGenericHandler } from "../core/createGenericHandler.js";
import { resolveImageLoader } from "../core/resolve.js";
import { debug, error } from "./logger.js";
import { optimizeImage } from "./plugins/image-optimization/image-optimization.js";
import { setNodeEnv } from "./util.js";

setNodeEnv();
const nextDir = path.join(__dirname, ".next");
const config = loadConfig(nextDir);
const buildId = loadBuildId(nextDir);
const nextConfig = {
  ...defaultConfig,
  images: {
    ...defaultConfig.images,
    ...config.images,
  },
};
debug("Init config", {
  nextDir,
  nextConfig,
});

/////////////
// Handler //
/////////////

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "imageOptimization",
});

export async function defaultHandler(
  event: InternalEvent,
  streamCreator?: StreamCreator,
): Promise<InternalResult> {
  // Images are handled via header and query param information.
  debug("handler event", event);
  const { headers, query: queryString } = event;

  try {
    // Set the HOST environment variable to the host header if it is not set
    // If it is set it is assumed to be set by the user and should be used instead
    // It might be useful for cases where the user wants to use a different host than the one in the request
    // It could even allow to have multiple hosts for the image optimization by setting the HOST environment variable in the wrapper for example
    if (!process.env.HOST) {
      const headersHost = headers["x-forwarded-host"] || headers["host"];
      process.env.HOST = headersHost;
    }

    const imageParams = validateImageParams(
      headers,
      queryString === null ? undefined : queryString,
    );
    let etag: string | undefined;
    // We don't cache any images, so in order to be able to return 304 responses, we compute an ETag from what is assumed to be static
    if (process.env.OPENNEXT_STATIC_ETAG) {
      etag = computeEtag(imageParams);
    }
    if (etag && headers["if-none-match"] === etag) {
      return {
        statusCode: 304,
        headers: {},
        body: "",
        isBase64Encoded: false,
        type: "core",
      };
    }
    const result = await optimizeImage(
      headers,
      imageParams,
      nextConfig,
      downloadHandler,
    );

    return buildSuccessResponse(result, streamCreator, etag);
  } catch (e: any) {
    return buildFailureResponse(e, streamCreator);
  }
}

//////////////////////
// Helper functions //
//////////////////////

function validateImageParams(
  headers: OutgoingHttpHeaders,
  query?: InternalEvent["query"],
) {
  // Next.js checks if external image URL matches the
  // `images.remotePatterns`
  const imageParams = ImageOptimizerCache.validateParams(
    // @ts-ignore
    { headers },
    query,
    nextConfig,
    false,
  );
  debug("image params", imageParams);
  if ("errorMessage" in imageParams) {
    throw new Error(imageParams.errorMessage);
  }
  return imageParams;
}

function computeEtag(imageParams: {
  href: string;
  width: number;
  quality: number;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        href: imageParams.href,
        width: imageParams.width,
        quality: imageParams.quality,
        buildId,
      }),
    )
    .digest("base64");
}

function buildSuccessResponse(
  result: any,
  streamCreator?: StreamCreator,
  etag?: string,
): InternalResult {
  const headers: Record<string, string> = {
    Vary: "Accept",
    "Content-Type": result.contentType,
    "Cache-Control": `public,max-age=${result.maxAge},immutable`,
  };
  debug("result", result);
  if (etag) {
    headers["ETag"] = etag;
  }

  if (streamCreator) {
    const response = new OpenNextNodeResponse(
      () => void 0,
      async () => void 0,
      streamCreator,
    );
    response.writeHead(200, headers);
    response.end(result.buffer);
  }

  return {
    type: "core",
    statusCode: 200,
    body: result.buffer.toString("base64"),
    isBase64Encoded: true,
    headers,
  };
}

function buildFailureResponse(
  e: any,
  streamCreator?: StreamCreator,
): InternalResult {
  debug(e);
  if (streamCreator) {
    const response = new OpenNextNodeResponse(
      () => void 0,
      async () => void 0,
      streamCreator,
    );
    response.writeHead(500, {
      Vary: "Accept",
      "Cache-Control": `public,max-age=60,immutable`,
      "Content-Type": "application/json",
    });
    response.end(e?.message || e?.toString() || e);
  }
  return {
    type: "core",
    isBase64Encoded: false,
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

const loader = await resolveImageLoader(
  globalThis.openNextConfig.imageOptimization?.loader ?? "s3",
);

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

      const response = await loader.load(url.href);

      if (!response.body) {
        throw new Error("Empty response body from the S3 request.");
      }

      // @ts-ignore
      pipeRes(response.body, res);

      // Respect the bucket file's content-type and cache-control
      // imageOptimizer will use this to set the results.maxAge
      if (response.contentType) {
        res.setHeader("Content-Type", response.contentType);
      }
      if (response.cacheControl) {
        res.setHeader("Cache-Control", response.cacheControl);
      }
    }
  } catch (e: any) {
    error("Failed to download image", e);
    throw e;
  }
}
