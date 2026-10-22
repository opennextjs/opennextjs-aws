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
 * The values are kept percent-encoded so that they can be reused as-is by
 * `convertToQueryString` (which does not re-encode). Iterating over
 * `searchParams.entries()` would decode the values, and since
 * `convertToQueryString` does not re-encode them, values containing
 * reserved characters (`&`, `=`, `+`, spaces, ...) would corrupt the
 * rebuilt query string.
 *
 * @param searchParams
 * @returns
 */
export function getQueryFromSearchParams(searchParams: URLSearchParams) {
  const querystring = searchParams.toString();
  if (querystring === "") return {};
  return getQueryFromIterator(
    querystring.split("&").map((part) => {
      const [key, value] = part.split("=");
      return [key, value] as const;
    }),
  );
}
