import type { OutgoingHttpHeaders } from "node:http";

/**
 * The name of the `cache-control` response header.
 */
export const CACHE_CONTROL_HEADER = "cache-control";

/**
 * The name of the header Next.js uses to report the cache status of a response.
 */
export const NEXTJS_CACHE_HEADER = "x-nextjs-cache";

/**
 * The name of the header OpenNext uses to report the cache status of a response
 * served by the cache interceptor.
 */
export const OPEN_NEXT_CACHE_HEADER = "x-opennext-cache";

/**
 * The name of the header Next.js uses to store the tags of a cache entry.
 *
 * Note that `types/cache.ts` repeats the literal, on purpose: it is a types only
 * module and importing a value into it would give it a runtime dependency.
 */
export const CACHE_TAGS_HEADER = "x-next-cache-tags";

/**
 * The name of the header OpenNext uses to mark a request as an ISR revalidation.
 */
export const ISR_HEADER = "x-isr";

/**
 * The name of the header Next.js uses to authorize a revalidation request.
 *
 * Carries the preview mode id from the prerender manifest.
 */
export const PRERENDER_REVALIDATE_HEADER = "x-prerender-revalidate";

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
