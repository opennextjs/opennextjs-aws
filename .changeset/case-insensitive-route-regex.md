---
"@opennextjs/aws": patch
---

fix: match `redirects`, `rewrites` and `headers` case-insensitively

Next.js serializes these route regular expressions in `routes-manifest.json` without their flags and matches them case-insensitively unless `experimental.caseSensitiveRoutes` is enabled. The runtime now adds the `i` flag unless the manifest sets `caseSensitive`.
