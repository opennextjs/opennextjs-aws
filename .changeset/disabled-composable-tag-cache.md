---
"@opennextjs/aws": patch
---

fix: honor `dangerous.disableTagCache` when reading `"use cache"` entries

The composable cache handler checked the tag cache even when it was disabled, so a failing tag cache backend turned a cache hit into a miss. The tag cache is no longer checked when `dangerous.disableTagCache` is set.
