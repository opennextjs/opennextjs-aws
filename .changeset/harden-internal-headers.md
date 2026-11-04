---
"@opennextjs/aws": patch
---

fix: do not expose more Next.js internal headers on the middleware response

Like Next.js, the internal `x-middleware-redirect` and `x-middleware-refresh` headers are now dropped from the middleware response.
