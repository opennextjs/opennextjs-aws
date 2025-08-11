import { createHash } from "node:crypto";

import { NextConfig, PrerenderManifest } from "config/index";
import type { InternalEvent, InternalResult } from "types/open-next";
import type { CacheValue } from "types/overrides";
import { emptyReadableStream, toReadableStream } from "utils/stream";

import { getTagsFromValue, hasBeenRevalidated } from "utils/cache";
import { debug } from "../../adapters/logger";
import { localizePath } from "./i18n";
import { generateMessageGroupId } from "./queue";
import { isBinaryContentType } from "utils/binary";

const CACHE_ONE_YEAR = 60 * 60 * 24 * 365;
const CACHE_ONE_MONTH = 60 * 60 * 24 * 30;

/*
 * We use this header to prevent Firefox (and possibly some CDNs) from incorrectly reusing the RSC responses during caching.
 * This can especially happen when there's a redirect in the middleware as the `_rsc` query parameter is not visible there.
 * So it will get dropped during the redirect, which results in the RSC response being cached instead of the actual HTML on the path `/`.
 * This value can be found in the routes manifest, under `rsc.varyHeader`.
 * They recompute it here in Next:
 * https://github.com/vercel/next.js/blob/c5bf5bb4c8b01b1befbbfa7ad97a97476ee9d0d7/packages/next/src/server/base-server.ts#L2011
 * Also see this PR: https://github.com/vercel/next.js/pull/79426
 */
const VARY_HEADER =
  "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";

async function computeCacheControl(
  path: string,
  body: string,
  host: string,
  revalidate?: number | false,
  lastModified?: number,
) {
  let finalRevalidate = CACHE_ONE_YEAR;

  const existingRoute = Object.entries(PrerenderManifest.routes).find(
    (p) => p[0] === path,
  )?.[1];
  if (revalidate === undefined && existingRoute) {
    finalRevalidate =
      existingRoute.initialRevalidateSeconds === false
        ? CACHE_ONE_YEAR
        : existingRoute.initialRevalidateSeconds;
    // eslint-disable-next-line sonarjs/elseif-without-else
  } else if (revalidate !== undefined) {
    finalRevalidate = revalidate === false ? CACHE_ONE_YEAR : revalidate;
  }
  // calculate age
  const age = Math.round((Date.now() - (lastModified ?? 0)) / 1000);
  const hash = (str: string) => createHash("md5").update(str).digest("hex");
  const etag = hash(body);
  if (revalidate === 0) {
    // This one should never happen
    return {
      "cache-control":
        "private, no-cache, no-store, max-age=0, must-revalidate",
      "x-opennext-cache": "ERROR",
      etag,
    };
  }
  if (finalRevalidate !== CACHE_ONE_YEAR) {
    const sMaxAge = Math.max(finalRevalidate - age, 1);
    debug("sMaxAge", {
      finalRevalidate,
      age,
      lastModified,
      revalidate,
    });
    const isStale = sMaxAge === 1;
    if (isStale) {
      let url = NextConfig.trailingSlash ? `${path}/` : path;
      if (NextConfig.basePath) {
        // We need to add the basePath to the url
        url = `${NextConfig.basePath}${url}`;
      }
      await globalThis.queue.send({
        MessageBody: {
          host,
          url,
          eTag: etag,
          lastModified: lastModified ?? Date.now(),
        },
        MessageDeduplicationId: hash(`${path}-${lastModified}-${etag}`),
        MessageGroupId: generateMessageGroupId(path),
      });
    }
    return {
      "cache-control": `s-maxage=${sMaxAge}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
      "x-opennext-cache": isStale ? "STALE" : "HIT",
      etag,
    };
  }
  return {
    "cache-control": `s-maxage=${CACHE_ONE_YEAR}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
    "x-opennext-cache": "HIT",
    etag,
  };
}

async function generateResult(
  event: InternalEvent,
  localizedPath: string,
  cachedValue: CacheValue<"cache">,
  lastModified?: number,
): Promise<InternalResult> {
  debug("Returning result from experimental cache");
  let body = "";
  let type = "application/octet-stream";
  let isDataRequest = false;
  switch (cachedValue.type) {
    case "app":
      isDataRequest = Boolean(event.headers.rsc);
      body = isDataRequest ? cachedValue.rsc : cachedValue.html;
      type = isDataRequest ? "text/x-component" : "text/html; charset=utf-8";
      break;
    case "page":
      isDataRequest = Boolean(event.query.__nextDataReq);
      body = isDataRequest
        ? JSON.stringify(cachedValue.json)
        : cachedValue.html;
      type = isDataRequest ? "application/json" : "text/html; charset=utf-8";
      break;
  }
  const cacheControl = await computeCacheControl(
    localizedPath,
    body,
    event.headers.host,
    cachedValue.revalidate,
    lastModified,
  );
  return {
    type: "core",
    // sometimes other status codes can be cached, like 404. For these cases, we should return the correct status code
    statusCode: cachedValue.meta?.status ?? 200,
    body: toReadableStream(body, false),
    isBase64Encoded: false,
    headers: {
      ...cacheControl,
      "content-type": type,
      ...cachedValue.meta?.headers,
      vary: VARY_HEADER,
    },
  };
}

/**
 *
 * https://github.com/vercel/next.js/blob/34039551d2e5f611c0abde31a197d9985918adaf/packages/next/src/shared/lib/router/utils/escape-path-delimiters.ts#L2-L10
 */
function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean,
): string {
  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? "|%(2f|23|3f|5c)" : ""})`, "gi"),
    (char: string) => encodeURIComponent(char),
  );
}

/**
 *
 * SSG cache key needs to be decoded, but some characters needs to be properly escaped
 * https://github.com/vercel/next.js/blob/34039551d2e5f611c0abde31a197d9985918adaf/packages/next/src/server/lib/router-utils/decode-path-params.ts#L11-L26
 */
function decodePathParams(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      try {
        return escapePathDelimiters(decodeURIComponent(segment), true);
      } catch (e) {
        // If decodeURIComponent fails, we return the original segment
        return segment;
      }
    })
    .join("/");
}

export async function cacheInterceptor(
  event: InternalEvent,
): Promise<InternalEvent | InternalResult> {
  if (
    Boolean(event.headers["next-action"]) ||
    Boolean(event.headers["x-prerender-revalidate"])
  )
    return event;

  // Check for Next.js preview mode cookies
  const cookies = event.headers.cookie || "";
  const hasPreviewData =
    cookies.includes("__prerender_bypass") ||
    cookies.includes("__next_preview_data");

  if (hasPreviewData) {
    debug("Preview mode detected, passing through to handler");
    return event;
  }
  // We localize the path in case i18n is enabled
  let localizedPath = localizePath(event);
  // If using basePath we need to remove it from the path
  if (NextConfig.basePath) {
    localizedPath = localizedPath.replace(NextConfig.basePath, "");
  }
  // We also need to remove trailing slash
  localizedPath = localizedPath.replace(/\/$/, "");

  // Then we decode the path params
  localizedPath = decodePathParams(localizedPath);

  debug("Checking cache for", localizedPath, PrerenderManifest);

  const isISR =
    Object.keys(PrerenderManifest.routes).includes(localizedPath ?? "/") ||
    Object.values(PrerenderManifest.dynamicRoutes).some((dr) =>
      new RegExp(dr.routeRegex).test(localizedPath),
    );
  debug("isISR", isISR);
  if (isISR) {
    try {
      const cachedData = await globalThis.incrementalCache.get(
        localizedPath ?? "/index",
      );
      debug("cached data in interceptor", cachedData);

      if (!cachedData?.value) {
        return event;
      }
      // We need to check the tag cache now
      if (cachedData.value?.type === "app") {
        const tags = getTagsFromValue(cachedData.value);
        const _hasBeenRevalidated = await hasBeenRevalidated(
          localizedPath,
          tags,
          cachedData,
        );
        if (_hasBeenRevalidated) {
          return event;
        }
      }
      const host = event.headers.host;
      switch (cachedData?.value?.type) {
        case "app":
        case "page":
          return generateResult(
            event,
            localizedPath,
            cachedData.value,
            cachedData.lastModified,
          );
        case "redirect": {
          const cacheControl = await computeCacheControl(
            localizedPath,
            "",
            host,
            cachedData.value.revalidate,
            cachedData.lastModified,
          );
          return {
            type: "core",
            statusCode: cachedData.value.meta?.status ?? 307,
            body: emptyReadableStream(),
            headers: {
              ...((cachedData.value.meta?.headers as Record<string, string>) ??
                {}),
              ...cacheControl,
            },
            isBase64Encoded: false,
          };
        }
        case "route": {
          const cacheControl = await computeCacheControl(
            localizedPath,
            cachedData.value.body,
            host,
            cachedData.value.revalidate,
            cachedData.lastModified,
          );

          const isBinary = isBinaryContentType(String(cachedData.value.meta?.headers?.["content-type"]));

          return {
            type: "core",
            statusCode: cachedData.value.meta?.status ?? 200,
            body: toReadableStream(cachedData.value.body, isBinary),
            headers: {
              ...cacheControl,
              ...cachedData.value.meta?.headers,
              vary: VARY_HEADER,
            },
            isBase64Encoded: isBinary,
          };
        }
        default:
          return event;
      }
    } catch (e) {
      debug("Error while fetching cache", e);
      // In case of error we fallback to the server
      return event;
    }
  }
  return event;
}
