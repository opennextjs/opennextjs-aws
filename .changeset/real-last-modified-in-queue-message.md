---
"@opennextjs/aws": patch
---

fix: send the time of entries made stale by a tag to the revalidation queue

For pages made stale by `revalidateTag`, the revalidation queue message had `lastModified: 1` instead of the time of the cache entry. It now has the time of the entry, so queues can skip messages for entries that were revalidated since. Deduplication is unchanged.
