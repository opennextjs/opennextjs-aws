import { getQueryFromIterator } from "http/util.js";

export function removeUndefinedFromQuery(
  query: Record<string, string | string[] | undefined>,
) {
  const newQuery: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      newQuery[key] = value;
    }
  }
  return newQuery;
}

/**
 * Extract the host from the headers (default to "on")
 *
 * @param headers
 * @returns The host
 */
export function extractHostFromHeaders(
  headers: Record<string, string>,
): string {
  return headers["x-forwarded-host"] ?? headers.host ?? "on";
}

/**
 * Get the query object from an URLSearchParams
 *
 * @param searchParams
 * @returns
 */
export function getQueryFromSearchParams(searchParams: URLSearchParams) {
  return getQueryFromIterator(searchParams.entries());
}
