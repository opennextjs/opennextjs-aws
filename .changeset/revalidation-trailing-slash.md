---
"@opennextjs/aws": patch
---

Fix revalidations being retried forever with `trailingSlash` enabled

When a request has been rewritten, the revalidation is enqueued for the rewritten
URL (`_nextRewroteUrl` on Next.js' internal request meta), which is a route
without a trailing slash. The revalidation function then sends a `HEAD` request
to it and only counts the revalidation as successful when the response carries
`x-nextjs-cache: REVALIDATED`. With `trailingSlash: true` that never happens: the
routing layer answers with a 308 to the slashed variant, mirroring the
normalization Next.js does itself, and a redirect carries no `x-nextjs-cache`
header. The record was therefore reported as failed and requeued, retried
forever, while the page never regenerated.

Revalidation URLs are now normalized to a trailing slash when
`trailingSlash` is enabled, matching what the queue interceptor already does.
URLs the routing layer would not redirect either are left untouched: Next.js data
requests (`/_next/data/<buildId>/<path>.json`) and paths whose last segment looks
like a file. Query strings are preserved.
