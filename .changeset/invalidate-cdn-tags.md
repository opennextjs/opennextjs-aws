---
"@opennextjs/aws": patch
---

feat: support native CDN tag invalidation

Allow CDN invalidation overrides to invalidate the original cache tags directly while preserving path invalidation as the fallback for existing handlers.
