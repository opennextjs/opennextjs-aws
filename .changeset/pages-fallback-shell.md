---
"@opennextjs/aws": patch
---

fix: serve the fallback shell of `fallback: true` Pages Router routes

The first request to a path that was not prerendered failed with `Invariant: received non-pages cache entry in pages handler`.

Next.js writes no `.json` for the shell, so it was cached as an App Router entry. It is now cached as a page with empty page data, as the Next.js file system cache returns it.
