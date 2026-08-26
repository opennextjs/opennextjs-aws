import type { OutgoingHttpHeaders } from "node:http";

const CACHE_CONTROL_HEADER = "cache-control";

/**
 * The `cache-control` OpenNext forces on error responses so that they are never cached.
 */
export const NO_STORE_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate";

/**
 * Overrides `cache-control` on error responses so that they are not cached.
 *
 * Next.js attaches cacheable `cache-control` headers to some error responses, and it writes
 * `notFound()` results for ISR routes to the incremental cache. Without this the CDN would hold
 * on to a 404 or a 500 - a transient one, such as a row that is not replicated yet, would stay
 * at the edge for as long as the route's revalidate period, up to a year for an SSG route.
 *
 * Only 404 and 500 are overridden. Any other error status is assumed to be produced by the
 * application, which is then responsible for setting its own cache headers.
 *
 * Set `OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS=true` to opt out and keep the original headers.
 *
 * @param headers The response headers, mutated in place
 * @param statusCode The status code of the response
 */
export function fixCacheControlForError(
  headers: OutgoingHttpHeaders | Record<string, string | string[]>,
  statusCode: number,
) {
  if (process.env.OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS === "true") {
    return;
  }
  if (statusCode === 404 || statusCode === 500) {
    headers[CACHE_CONTROL_HEADER] = NO_STORE_CACHE_CONTROL;
  }
}
