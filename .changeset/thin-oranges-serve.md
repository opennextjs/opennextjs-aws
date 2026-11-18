---
"@opennextjs/aws": patch
---

feat: add an experimental `onTagCacheResult` callback to the entries returned by the incremental cache

The callback and its `TagCacheResult` type are experimental: they may change in a minor or patch release.

An incremental cache can set `onTagCacheResult` on an entry returned by `get`. OpenNext calls it once the tag verdict is known, even when tag checks are skipped. The callback receives `hasBeenRevalidated`, `isStaleFromTag` and, from the cache interceptor, `isStaleFromTime`.
As the callback is attached to the entry, the verdict always applies to that read, even when a key is read several times concurrently.
It allows e.g. a regional cache to only be populated with entries that are neither revalidated nor stale.
Errors thrown by the callback are logged and do not affect how the entry is used.

The cache interceptor computes `isStaleFromTime` once before invoking the callback. The response headers and revalidation queue use that same timing snapshot, even if the callback changes the entry’s `revalidate` interval.

The `x-next-cache-tags` header is no longer removed from the cached value when its tags are read.
