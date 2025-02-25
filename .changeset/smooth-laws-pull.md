---
"@opennextjs/aws": patch
---

`InternalEvent#url` is now a full URL

BREAKING CHANGE: `InternalEvent#url` was only composed of the path and search query before.

Custom converters should be updated to populate the full URL instead.
