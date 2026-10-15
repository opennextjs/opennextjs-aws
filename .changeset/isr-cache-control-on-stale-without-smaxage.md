---
"@opennextjs/aws": patch
---

Set a cache-control on stale cache reads that have none

`fixISRHeaders` only adjusted responses whose `cache-control` already contained
an `s-maxage`, and a cache read can come back with no `cache-control` at all.
Next.js resolves the revalidate of a page through `SharedCacheControls`, which is
only populated for the paths the current instance rendered itself and otherwise
falls back to the prerender manifest — where a page generated on demand is not
listed. An instance that serves such a page out of the shared cache rather than
rendering it therefore has no `entry.cacheControl` and emits no `s-maxage`, so
the response was left with no cache-control and could not be cached by the CDN at
all. The cheapest responses to serve were the only ones going back to the origin
every time.

A response served from a stale cache entry now falls back to the same
`s-maxage=2, stale-while-revalidate=2592000` that stale responses with an
`s-maxage` already get. This is only a fallback for entries with no revalidate
window to recover at all, it never stands in for a real one. The header is only
ever added, never replaced, so `no-store` and `private` responses stay as they
are, and only stale reads are covered: without an `s-maxage` there is no
revalidate window a cache hit could derive its remaining TTL from.
