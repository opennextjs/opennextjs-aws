---
"@opennextjs/aws": patch
---

Fix pages with `fallback: false` returning a 404 instead of falling through to a less specific dynamic route on Next.js 16.4.

Preserve existing fallback routing and parameter-decoding behavior on Next.js versions before 16.4.
