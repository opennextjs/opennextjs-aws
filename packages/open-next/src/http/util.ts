import type http from "node:http";

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
    // Next can return an Array for the Location header
    // We dont want to merge that into a comma-separated string
    // See: https://github.com/opennextjs/opennextjs-cloudflare/issues/875#issuecomment-3258248276
    if (key.toLowerCase() === "location" && Array.isArray(value)) {
      result[key.toLowerCase()] = value[0];
      continue;
    }
    result[key.toLowerCase()] = convertHeader(value);
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
