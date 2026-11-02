---
"@opennextjs/aws": patch
---

fix: use a hash of the composable cache key as storage key

The `"use cache"` handler now stores entries in the incremental cache and the tag cache under the sha256 of the key provided by Next.js instead of the raw key, so that every storage backend gets a fixed format key.

Existing `"use cache"` entries are not read after the upgrade and will be regenerated on first access.
