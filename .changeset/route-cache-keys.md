---
"@opennextjs/aws": patch
---

fix(cache): normalize the scoped response cache keys introduced in Next.js 16.3.8

Next.js 16.3.8 prefixes response cache keys with `/route-cache/<kind>/<sha256(sourceRoute)>/$`. The incremental cache adapter now strips this prefix so that entries written on revalidation use the same key as the cache interceptor and the build-time cache population.
