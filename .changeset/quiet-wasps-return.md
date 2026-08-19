---
"@opennextjs/aws": patch
---

Fix for undefined rsc data in the cache

Next.js does not write the `.rsc` file for fallback shells and for PPR routes with a
postponed state, so `rsc` can be absent from a cache entry. The types now reflect that
and the cache interceptor falls back to the server for those entries instead of serving
an empty RSC payload.

`html` is optional in `CachedFile` for the same reason, and a cache entry missing the
data needed to serve a request is now reported as a miss rather than serving an
incomplete response.
