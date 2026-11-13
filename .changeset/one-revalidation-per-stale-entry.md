---
"@opennextjs/aws": patch
---

fix: queue one revalidation per stale cache entry

The deduplication id of a revalidation message included a hash of the response body, so a document request, an RSC request and each segment prefetch of the same stale entry all queued their own revalidation.
