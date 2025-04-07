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
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
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
