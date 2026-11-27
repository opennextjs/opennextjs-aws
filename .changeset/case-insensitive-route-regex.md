---
"@opennextjs/aws": patch
---

fix: match `redirects` and `headers` case-insensitively

As with Next.js, the `headers()` and `redirects()` of `next.config` now match paths case-insensitively (e.g. `/About` matches `/about`), unless `experimental.caseSensitiveRoutes` is enabled.
