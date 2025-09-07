import type http from "node:http";
import logger from "../logger";

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
     * Next can return an Array for the Location header
     * We dont want to merge that into a comma-separated string
     * If they are the same just return one of them
     * Otherwise return the last one
     * See: https://github.com/opennextjs/opennextjs-cloudflare/issues/875#issuecomment-3258248276
     * and https://github.com/opennextjs/opennextjs-aws/pull/977#issuecomment-3261763114
     */
    if (keyLower === "location" && Array.isArray(value)) {
      if (value[0] === value[1]) {
        result[keyLower] = value[0];
      } else {
        logger.warn(
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
