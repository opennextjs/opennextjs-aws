---
"@opennextjs/aws": patch
---

Resolve the request store each time the `@next/request-context` getter is called, instead of capturing the store of the request that last published it
