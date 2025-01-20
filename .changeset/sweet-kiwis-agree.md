---
"@opennextjs/aws": patch
---

refactor(cache): deprecate global disableDynamoDBCache and disableIncrementalCache

In the cache adapter:

- `globalThis.disableDynamoDBCache` is deprecated and will be removed.
  use `globalThis.openNextConfig.dangerous?.disableTagCache` instead.
- `globalThis.disableIncrementalCache` is deprecated and will be removed.
  use `globalThis.openNextConfig.dangerous?.disableIncrementalCache` instead.
