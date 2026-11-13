import type http from "node:http";
import { warn } from "../adapters/logger";

export const parseHeaders = (
  headers?: http.OutgoingHttpHeader[] | http.OutgoingHttpHeaders,
) => {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const keyLower = key.toLowerCase();
    /**
     * Next can return an Array for the Location header when you return null from a get in the cacheHandler on a page that has a redirect()
     * We dont want to merge that into a comma-separated string
     * If they are the same just return one of them
     * Otherwise return the last one
     * See: https://github.com/opennextjs/opennextjs-cloudflare/issues/875#issuecomment-3258248276
     * and https://github.com/opennextjs/opennextjs-aws/pull/977#issuecomment-3261763114
     */
    if (keyLower === "location" && Array.isArray(value)) {
      if (value.length === 1 || value[0] === value[1]) {
        result[keyLower] = value[0];
      } else {
        warn(
          "Multiple different values for Location header found. Using the last one",
        );
        result[keyLower] = value[value.length - 1];
      }
      continue;
    }
    result[keyLower] = convertHeader(value);
  }

  return result;
};

export const convertHeader = (header: http.OutgoingHttpHeader) => {
  if (typeof header === "string") {
    return header;
  }
  if (Array.isArray(header)) {
    return header.join(",");
  }
  return String(header);
};

/**
 * Parses a (comma-separated) list of Set-Cookie headers
 *
 * @param cookies A comma-separated list of Set-Cookie headers or a list of Set-Cookie headers
 * @returns A list of Set-Cookie header
 */
export function parseSetCookieHeader(
  cookies: string | string[] | null | undefined,
): string[] {
  if (!cookies) {
    return [];
  }

  if (typeof cookies === "string") {
    // Split the cookie string on ",".
    // Note that "," can also appear in the Expires value (i.e. `Expires=Thu, 01 June`)
    // so we have to skip it with a negative lookbehind.
    return cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim());
  }

  return cookies;
}

/**
 * Converts the headers of a response returned by an edge function.
 *
 * `Set-Cookie` headers are returned as a list.
 * The internal `x-middleware-set-cookie` header is dropped: `NextResponse` sets it when
 * `response.cookies` is modified (i.e. in a route handler) and it contains the `HttpOnly` cookies.
 *
 * @param headers The headers of the response
 * @returns The response headers to send to the client
 */
export function convertEdgeResponseHeaders(
  headers: Pick<Headers, "forEach" | "getSetCookie">,
): Record<string, string | string[]> {
  const responseHeaders: Record<string, string | string[]> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Headers.forEach folds same-name headers; use getSetCookie() below instead.
    if (lowerKey === "set-cookie" || lowerKey === "x-middleware-set-cookie") {
      return;
    }
    responseHeaders[key] = value;
  });
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders["set-cookie"] = setCookies;
  }
  return responseHeaders;
}

/**
 *
 * Get the query object from an iterable of [key, value] pairs
 * @param it - The iterable of [key, value] pairs
 * @returns The query object
 */
export function getQueryFromIterator(it: Iterable<[string, string]>) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of it) {
    if (key in query) {
      if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    } else {
      query[key] = value;
    }
  }
  return query;
}
