---
"@opennextjs/aws": patch
---

fix: support `res.revalidate()` in Pages Router API routes on Next 15.4+

`res.revalidate()` used to throw `Invariant: missing internal router-server-methods this is an internal bug`.

Pages served by the same function are now revalidated in-process (as with `next start`) and then invalidated in the CDN. Pages served by another split function are revalidated with a `HEAD` request that only forwards the revalidation headers.
