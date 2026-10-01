---
"@opennextjs/aws": patch
---

fix(cache): use the scoped response cache keys introduced in Next.js 16.3.8

Next.js 16.3.8 scopes response cache keys by their source route: `/route-cache/<kind>/<sha256(sourceRoute)>/$<pathname>`. The cache assets created at build time and the cache interceptor now compute the same keys as Next.js, both for prerendered routes and for entries cached at runtime. CDN invalidation on `revalidateTag` maps those keys back to their pathname.
