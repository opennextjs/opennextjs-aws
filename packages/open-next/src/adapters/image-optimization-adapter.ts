import { createHash } from "node:crypto";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import https from "node:https";
import path from "node:path";
import type { Writable } from "node:stream";

import { loadBuildId, loadConfig } from "config/util.js";
import { OpenNextNodeResponse } from "http/openNextResponse.js";
// @ts-ignore
import { defaultConfig } from "next/dist/server/config-shared";
import {
  ImageOptimizerCache,
  // @ts-ignore
} from "next/dist/server/image-optimizer";
// @ts-ignore
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";
import type {
  InternalEvent,
  InternalResult,
  StreamCreator,
} from "types/open-next.js";
import { emptyReadableStream, toReadableStream } from "utils/stream.js";

import type { OpenNextHandlerOptions } from "types/overrides.js";
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
  options?: OpenNextHandlerOptions,
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
      const headersHost = headers["x-forwarded-host"] || headers.host;
      process.env.HOST = headersHost;
    }

    const imageParams = validateImageParams(
      headers,
      queryString === null ? undefined : queryString,
    );
    // We return a 400 here if imageParams returns an errorMessage
    // https://github.com/vercel/next.js/blob/512d8283054407ab92b2583ecce3b253c3be7b85/packages/next/src/server/next-server.ts#L937-L941
    if ("errorMessage" in imageParams) {
      error(
        "Error during validation of image params",
        imageParams.errorMessage,
      );
      return buildFailureResponse(
        imageParams.errorMessage,
        options?.streamCreator,
        400,
      );
    }
    let etag: string | undefined;
    // We don't cache any images, so in order to be able to return 304 responses, we compute an ETag from what is assumed to be static
    if (process.env.OPENNEXT_STATIC_ETAG) {
      etag = computeEtag(imageParams);
    }
    if (etag && headers["if-none-match"] === etag) {
      return {
        statusCode: 304,
        headers: {},
        body: emptyReadableStream(),
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
    return buildSuccessResponse(result, options?.streamCreator, etag);
  } catch (e: any) {
    error("Failed to optimize image", e);

    // Determine appropriate status code based on error
    let statusCode = 500; // Default to 500 for unknown errors
    let errorMessage = "Internal server error";

    // Check if error has HTTP status information
    if (e && typeof e === "object") {
      if ("statusCode" in e && typeof e.statusCode === "number") {
        statusCode = e.statusCode;
        errorMessage = `HTTP Error: ${statusCode}`;
      } else if ("code" in e) {
        const code = e.code as string;
        if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
          statusCode = 404;
          errorMessage = `Image not found: ${e.message}`;
        }
      }

      if (e.message && typeof e.message === "string") {
        // Try to extract status codes from error messages
        if (e.message.includes("403") || e.message.includes("Access Denied")) {
          statusCode = 403;
          errorMessage = `Access denied: ${e.message}`;
        } else if (
          e.message.includes("404") ||
          e.message.includes("Not Found")
        ) {
          statusCode = 404;
          errorMessage = `Image not found: ${e.message}`;
        } else {
          errorMessage = e.message;
        }
      }
    }

    return buildFailureResponse(
      errorMessage,
      options?.streamCreator,
      statusCode,
    );
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
    headers.ETag = etag;
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
    body: toReadableStream(result.buffer, true),
    isBase64Encoded: true,
    headers,
  };
}

function buildFailureResponse(
  errorMessage: string,
  streamCreator?: StreamCreator,
  statusCode = 500,
): InternalResult {
  debug(errorMessage, statusCode);
  if (streamCreator) {
    const response = new OpenNextNodeResponse(
      () => void 0,
      async () => void 0,
      streamCreator,
    );
    response.writeHead(statusCode, {
      Vary: "Accept",
      "Cache-Control": "public,max-age=60,immutable",
    });
    response.end(errorMessage);
  }
  return {
    type: "core",
    isBase64Encoded: false,
    statusCode: statusCode,
    headers: {
      Vary: "Accept",
      // For failed images, allow client to retry after 1 minute.
      "Cache-Control": "public,max-age=60,immutable",
    },
    body: toReadableStream(errorMessage),
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
      const request = https.get(url, (response) => {
        // Check for HTTP error status codes
        if (response.statusCode && response.statusCode >= 400) {
          error(`Failed to get image: HTTP ${response.statusCode}`);
          res.statusCode = response.statusCode;
          res.end();
          return;
        }
        // IncomingMessage is a Readable stream, not a Writable
        // We need to pipe it directly to the response
        response
          .pipe(res)
          .once("close", () => {
            if (!res.headersSent) {
              res.statusCode = 200;
            }
            res.end();
          })
          .once("error", (pipeErr) => {
            error("Failed to get image during piping", pipeErr);
            if (!res.headersSent) {
              res.statusCode = 400;
            }
            res.end();
          });
      });

      request.on("error", (err: NodeJS.ErrnoException) => {
        error("Failed to get image", err);
        // Handle common network errors
        if (err && typeof err === "object" && "code" in err) {
          if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
            res.statusCode = 404;
          } else {
            res.statusCode = 400;
          }
        } else {
          res.statusCode = 400;
        }
        res.end();
      });
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
