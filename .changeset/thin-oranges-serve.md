---
"@opennextjs/aws": patch
---

feat: add an optional `onTagCacheResult` callback to the entries returned by the incremental cache

An incremental cache can set `onTagCacheResult` on an entry returned by `get`. OpenNext calls it once the tag verdict is known, even when tag checks are skipped. The callback receives `hasBeenRevalidated`, `isStaleFromTag` and, from the cache interceptor, `isStaleFromTime`.
As the callback is attached to the entry, the verdict always applies to that read, even when a key is read several times concurrently.
It allows i.e. a regional cache to only be populated with entries that are neither revalidated nor stale.
Errors thrown by the callback are logged and do not affect how the entry is used.

The cache interceptor computes `isStaleFromTime` once before invoking the callback. The response headers and revalidation queue use that same timing snapshot, even if the callback changes the entry’s `revalidate` interval.

The `x-next-cache-tags` header is no longer removed from the cached value when its tags are read.
