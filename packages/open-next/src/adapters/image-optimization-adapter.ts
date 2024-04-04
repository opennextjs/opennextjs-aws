import { createHash } from "node:crypto";
import {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import https from "node:https";
import path from "node:path";
import { Writable } from "node:stream";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
import { ImageLoader, InternalEvent, InternalResult } from "types/open-next.js";

import { createGenericHandler } from "../core/createGenericHandler.js";
import { awsLogger, debug, error } from "./logger.js";
import { optimizeImage } from "./plugins/image-optimization/image-optimization.js";
import { setNodeEnv } from "./util.js";

// Expected environment variables
const { BUCKET_NAME, BUCKET_KEY_PREFIX } = process.env;

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
  BUCKET_NAME,
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
    // const headers = normalizeHeaderKeysToLowercase(rawHeaders);

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

    return buildSuccessResponse(result, etag);
  } catch (e: any) {
    return buildFailureResponse(e, streamCreator);
  }
}

//////////////////////
// Helper functions //
//////////////////////

// function normalizeHeaderKeysToLowercase(headers: APIGatewayProxyEventHeaders) {
//   // Make header keys lowercase to ensure integrity
//   return Object.entries(headers).reduce(
//     (acc, [key, value]) => ({ ...acc, [key.toLowerCase()]: value }),
//     {} as APIGatewayProxyEventHeaders,
//   );
// }

function ensureBucketExists() {
  if (!BUCKET_NAME) {
    throw new Error("Bucket name must be defined!");
  }
}

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

function buildSuccessResponse(result: any, etag?: string): InternalResult {
  const headers: Record<string, string> = {
    Vary: "Accept",
    "Content-Type": result.contentType,
    "Cache-Control": `public,max-age=${result.maxAge},immutable`,
  };
  if (etag) {
    headers["ETag"] = etag;
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

const resolveLoader = () => {
  const openNextParams = globalThis.openNextConfig.imageOptimization;
  if (typeof openNextParams?.loader === "function") {
    return openNextParams.loader();
  } else {
    const s3Client = new S3Client({ logger: awsLogger });
    return Promise.resolve<ImageLoader>({
      name: "s3",
      // @ts-ignore
      load: async (key: string) => {
        ensureBucketExists();
        const keyPrefix = BUCKET_KEY_PREFIX?.replace(/^\/|\/$/g, "");
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: keyPrefix
              ? keyPrefix + "/" + key.replace(/^\//, "")
              : key.replace(/^\//, ""),
          }),
        );
        return {
          body: response.Body,
          contentType: response.ContentType,
          cacheControl: response.CacheControl,
        };
      },
    });
  }
};
const loader = await resolveLoader();

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
