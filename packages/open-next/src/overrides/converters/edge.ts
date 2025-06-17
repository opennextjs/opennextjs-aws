import { Buffer } from "node:buffer";

import cookieParser from "cookie";
import { parseSetCookieHeader } from "http/util";
import type {
  InternalEvent,
  InternalResult,
  MiddlewareResult,
} from "types/open-next";
import type { Converter } from "types/overrides";
import { getQueryFromSearchParams } from "./utils.js";

declare global {
  // Makes convertTo returns the request instead of fetching it.
  var __dangerous_ON_edge_converter_returns_request: boolean | undefined;
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

const converter: Converter<InternalEvent, InternalResult | MiddlewareResult> = {
  convertFrom: async (event: Request) => {
    const url = new URL(event.url);

    const searchParams = url.searchParams;
    const query = getQueryFromSearchParams(searchParams);
    // Transform body into Buffer
    const body = await event.arrayBuffer();
    const headers: Record<string, string> = {};
    event.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const rawPath = url.pathname;
    const method = event.method;
    const shouldHaveBody = method !== "GET" && method !== "HEAD";

    const cookieHeader = event.headers.get("cookie");
    const cookies = cookieHeader
      ? (cookieParser.parse(cookieHeader) as Record<string, string>)
      : {};

    return {
      type: "core",
      method,
      rawPath,
      url: event.url,
      body: shouldHaveBody ? Buffer.from(body) : undefined,
      headers,
      remoteAddress: event.headers.get("x-forwarded-for") ?? "::1",
      query,
      cookies,
    };
  },
  convertTo: async (result) => {
    if ("internalEvent" in result) {
      const request = new Request(result.internalEvent.url, {
        body: result.internalEvent.body,
        method: result.internalEvent.method,
        headers: {
          ...result.internalEvent.headers,
          "x-forwarded-host": result.internalEvent.headers.host,
        },
      });

      if (globalThis.__dangerous_ON_edge_converter_returns_request === true) {
        return request;
      }

      const cfCache =
        (result.isISR ||
          result.internalEvent.rawPath.startsWith("/_next/image")) &&
        process.env.DISABLE_CACHE !== "true"
          ? { cacheEverything: true }
          : {};

      return fetch(request, {
        // This is a hack to make sure that the response is cached by Cloudflare
        // See https://developers.cloudflare.com/workers/examples/cache-using-fetch/#caching-html-resources
        // @ts-expect-error - This is a Cloudflare specific option
        cf: cfCache,
      });
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(result.headers)) {
      if (key === "set-cookie" && typeof value === "string") {
        // If the value is a string, we need to parse it into an array
        // This is the case for middleware direct result
        const cookies = parseSetCookieHeader(value);
        for (const cookie of cookies) {
          headers.append(key, cookie);
        }
        continue;
      }
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    // We should not return a body for statusCode's that doesn't allow bodies
    const body = NULL_BODY_STATUSES.has(result.statusCode)
      ? null
      : (result.body as ReadableStream);

    return new Response(body, {
      status: result.statusCode,
      headers,
    });
  },
  name: "edge",
};

export default converter;
