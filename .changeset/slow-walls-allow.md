---
"@opennextjs/aws": minor
---

Add an option to keep the data cache persistent between deployments.

BREAKING CHANGE: Incremental cache keys are now an object of type `CacheKey` instead of a string. The new type includes properties like `baseKey`, `buildId`, and `cacheType`. Build_id is automatically provided according to the cache type and the `dangerous.persistentDataCache` option. Up to the Incremental Cache implementation to use it as they see fit.
**Custom Incremental cache will need to be updated**