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
