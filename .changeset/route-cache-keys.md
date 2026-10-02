---
"@opennextjs/aws": patch
---

fix(cache): support scoped response cache keys in fixed Next.js releases

Next.js 15.5.27 and 16.3.8 scope response cache keys by their source route: `/route-cache/<kind>/<sha256(sourceRoute)>/$<pathname>`. OpenNext preserves emitted build keys, selects the matching owner before cache interception, and maps scoped keys back to the correct public route during CDN invalidation.
