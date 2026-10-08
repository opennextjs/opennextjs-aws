---
"@opennextjs/aws": patch
---

perf: compile the routing matcher regular expressions only once

The patterns used to match configured headers, redirects, rewrites and `fallback: false` routes are now compiled on first use and reused by later requests.
