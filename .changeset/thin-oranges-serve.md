---
"@opennextjs/aws": minor
---

Add an optional `onTagCacheResult` hook to the incremental cache

The hook is notified of the tag cache verdict (`hasBeenRevalidated`, `isStaleFromTag` and, from the cache interceptor, `isStaleFromTime`) for every entry returned by `get`.
It allows i.e. a regional cache to only be populated with entries that are neither revalidated nor stale.
Errors thrown by the hook are logged and do not affect how the entry is used.

The `x-next-cache-tags` header is no longer removed from the cached value when its tags are read.
