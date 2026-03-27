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
import { FatalError, IgnorableError } from "../utils/error.js";
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
    // Extract status code from error or default to 400 Bad Request
    const statusCode = e.statusCode || 400;
    const errorMessage = e.message || "Failed to process image request";

    // Create an IgnorableError for proper monitoring classification
    const clientError = new IgnorableError(errorMessage, statusCode);
    error("Failed to optimize image", clientError);

    return buildFailureResponse(
      errorMessage,
      options?.streamCreator,
      statusCode, // Use the appropriate status code (preserving original when available)
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

  /**
   * Helper function to handle image errors consistently with appropriate response
   * @param e The error object
   * @param res The server response object
   * @param isInternalImage Whether the error is from an internal image (S3) or external image
   */
  function handleImageError(
    e: any,
    res: ServerResponse,
    isInternalImage: boolean,
  ) {
    const originalStatus = e.statusCode || e.$metadata?.httpStatusCode || 500;
    const message = e.message || "Failed to process image request";

    // Log all other errors as client errors
    const clientError = new IgnorableError(message, originalStatus);
    error("Failed to process image", clientError);

    // For external images we throw with the status code
    // Next.js will preserve the status code for external images
    if (!isInternalImage) {
      const statusCode = originalStatus >= 500 ? 400 : originalStatus;
      throw new FatalError(message, statusCode);
    }

    // Different handling for internal vs external images
    const finalStatus = originalStatus >= 500 ? 400 : originalStatus;
    res.statusCode = finalStatus;

    // For internal images, we want to trigger Next.js's "internal response invalid" message
    if (isInternalImage) {
      // For internal images, don't set Content-Type to trigger Next.js's default error handling
      // This should result in "url parameter is valid but internal response is invalid"

      // Still include error details in headers for debugging only
      res.setHeader("x-nextjs-internal-error", message);
      res.end();
    } else {
      // For external images, maintain existing behavior with text/plain
      res.setHeader("Content-Type", "text/plain");

      // We should **never** send the error message to the client
      // This is to prevent leaking sensitive information
      res.end("Failed to process image request");
    }
  }

  // Pipes data from a writable stream to the server response
  function pipeStream(
    stream: Writable,
    res: ServerResponse,
    isInternalImage: boolean,
  ) {
    stream
      .pipe(res)
      .once("close", () => {
        res.statusCode = 200;
        res.end();
      })
      .once("error", (err) => {
        error("Error streaming image data", err);
        handleImageError(err, res, isInternalImage);
      });
  }

  // Main handler logic with clearer error paths
  try {
    // remote image URL => download the image from the URL
    if (url.href.toLowerCase().match(/^https?:\/\//)) {
      try {
        pipeStream(https.get(url), res, false);
      } catch (e: any) {
        handleImageError(e, res, false);
      }
      return;
    }

    // local image => download the image from the provided ImageLoader (default is S3)
    try {
      const response = await loader.load(url.href);

      // Handle empty response body
      if (!response.body) {
        const message = "Empty response body from the S3 request.";
        const clientError = new IgnorableError(message, 400);
        error("Empty response from ImageLoader", clientError);

        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain");
        res.end(message);
        return;
      }

      // Set headers from the response
      if (response.contentType) {
        res.setHeader("Content-Type", response.contentType);
      }
      if (response.cacheControl) {
        res.setHeader("Cache-Control", response.cacheControl);
      }

      // Stream the image to the client
      // @ts-ignore
      pipeStream(response.body, res, true);
    } catch (e: any) {
      // Direct response for all internal image errors
      handleImageError(e, res, true);
    }
  } catch (e: any) {
    // Catch-all for any unexpected errors
    handleImageError(e, res, true);
  }
}
