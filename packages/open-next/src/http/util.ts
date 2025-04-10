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

export function parseCookies(
  cookies: string | string[] | null | undefined,
): string[] {
  if (!cookies) {
    return [];
  }

  return typeof cookies === "string"
    ? cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim())
    : cookies;
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
