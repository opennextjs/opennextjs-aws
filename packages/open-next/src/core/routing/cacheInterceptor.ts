import { createHash } from "node:crypto";

import { NextConfig, PrerenderManifest } from "config/index";
import type { InternalEvent, InternalResult } from "types/open-next";
import type { CacheValue } from "types/overrides";
import { emptyReadableStream, toReadableStream } from "utils/stream";

import { debug } from "../../adapters/logger";
import { localizePath } from "./i18n";
import { generateMessageGroupId } from "./util";

const CACHE_ONE_YEAR = 60 * 60 * 24 * 365;
const CACHE_ONE_MONTH = 60 * 60 * 24 * 30;

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
        MessageBody: { host, url },
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
  cachedValue: CacheValue<false>,
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
    statusCode: 200,
    body: toReadableStream(body, false),
    isBase64Encoded: false,
    headers: {
      ...cacheControl,
      "content-type": type,
      ...cachedValue.meta?.headers,
    },
  };
}

export async function cacheInterceptor(
  event: InternalEvent,
): Promise<InternalEvent | InternalResult> {
  if (
    Boolean(event.headers["next-action"]) ||
    Boolean(event.headers["x-prerender-revalidate"])
  )
    return event;
  // We localize the path in case i18n is enabled
  let localizedPath = localizePath(event);
  // If using basePath we need to remove it from the path
  if (NextConfig.basePath) {
    localizedPath = localizedPath.replace(NextConfig.basePath, "");
  }
  // We also need to remove trailing slash
  localizedPath = localizedPath.replace(/\/$/, "");
  // If empty path, it means we want index
  if (localizedPath === "") {
    localizedPath = "index";
  }

  debug("Checking cache for", localizedPath, PrerenderManifest);

  const isISR =
    Object.keys(PrerenderManifest.routes).includes(localizedPath) ||
    Object.values(PrerenderManifest.dynamicRoutes).some((dr) =>
      new RegExp(dr.routeRegex).test(localizedPath),
    );
  debug("isISR", isISR);
  if (isISR) {
    try {
      const cachedData = await globalThis.incrementalCache.get(localizedPath);
      debug("cached data in interceptor", cachedData);

      if (!cachedData?.value) {
        return event;
      }

      if (cachedData?.value?.type === "app") {
        // We need to check the tag cache now
        const _lastModified = await globalThis.tagCache.getLastModified(
          localizedPath,
          cachedData.lastModified,
        );
        if (_lastModified === -1) {
          // If some tags are stale we need to force revalidation
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
