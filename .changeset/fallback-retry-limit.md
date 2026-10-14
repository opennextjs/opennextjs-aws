---
"@opennextjs/aws": patch
---

Allow up to six rendering attempts when falling through `fallback: false` routes, matching the Next.js router server (since Next.js 13.4.13). A sixth matching route candidate previously returned a 500.
