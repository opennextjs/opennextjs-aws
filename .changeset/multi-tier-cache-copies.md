---
"@opennextjs/aws": patch
---

fix: keep cache tags on `multi-tier-ddb-s3` local entries so `revalidateTag` and `updateTag` still invalidate them

The multi-tier cache stored the object it read from S3 and returned that same object on every local hit. `getTagsFromValue` deletes the cache-tags header from the entry it reads, so after the first read the cached page had no tags, and tag revalidation never invalidated it on that instance. The local cache now keeps its own copy and returns a copy on each hit.
