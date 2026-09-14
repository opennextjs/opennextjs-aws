---
"@opennextjs/aws": patch
---

Seed Next.js' route cache controls from the cache entry on read

Next.js resolves the TTL of a route from `IncrementalCache#cacheControls`, a
process wide map that is only fed by `IncrementalCache#set` and by the prerender
manifest. A page rendered on demand is in neither: the manifest has no entry for
the concrete path (`dynamicRoutes` is keyed by the route pattern, and a Pages
Router `getStaticPaths` returning `paths: []` writes no `fallbackRevalidate`),
and the map is only warm on the instance that happened to render that exact
path. `IncrementalCache#calculateRevalidate` then falls back to a hardcoded one
second, so on a deployment where several instances share one cache every read of
an entry older than a second was reported stale - enqueuing a revalidation on
nearly every request instead of once per revalidate window - and the entry got
no `cacheControl`, so Next.js emitted no `Cache-Control` header for it and the
CDN could not cache the response.

The incremental cache adapter already persists `revalidate` in every cache entry
on `set`, and `IncrementalCache#get` awaits the cache handler before it reads the
map, so the value is now seeded from the read and applies to the same request. It
is only written when Next.js has no cache control for the route yet, so a
prerendered route keeps the one from its manifest, and only for a numeric
`revalidate` of at least 1 - `false` would become a year of CDN caching and a
lower value makes Next.js' pages handler throw. Fetch cache reads are untouched.

The seeded `expire` is left undefined: from Next.js 16.3 the incremental cache
forces a blocking revalidation when `lastModified + expire` is in the past, and
it only runs that check for a numeric `expire`, so stale entries keep being
served stale while revalidating in the background.
