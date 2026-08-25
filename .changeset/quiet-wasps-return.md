---
"@opennextjs/aws": patch
---

Fix for undefined rsc data in the cache

A cache entry does not always hold every field: the build only stores `rsc` when it
collected a `.rsc` or a `.prefetch.rsc` file, and only stores `html` when it collected an
`.html` file. `CachedFile` claimed both were always present, so `Buffer.from(cacheData.rsc)`
threw on such an entry and the cache handler turned that into a permanent miss.

`rsc` and `html` are now optional and an entry that lacks the data needed to serve a
request is reported as a miss instead of being served incomplete. The cache interceptor
falls back to the server for those entries rather than serving an empty RSC payload, which
a CDN could otherwise cache.
