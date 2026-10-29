---
"@opennextjs/aws": patch
---

fix: report the lifetime of a cache entry to Next.js

A page rendered on demand by a dynamic route was reported as stale one second after it was written by any instance that did not render it. The `expire` passed by Next.js is now stored with the entry, and `get` reports both `revalidate` and `expire`.
