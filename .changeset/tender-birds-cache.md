---
"@opennextjs/aws": patch
---

fix: read and write local fetch cache entries in the build's `__fetch` namespace

The `fs-dev` incremental cache now honors the cache type, so local ISR reuses
build-time fetch and `unstable_cache` data instead of treating those entries as
misses. Fetch entries no longer share file paths with page and route entries.
