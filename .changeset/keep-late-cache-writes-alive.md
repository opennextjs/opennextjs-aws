---
"@opennextjs/aws": patch
---

Keep late incremental cache writes and their tag updates alive with the runtime's `waitUntil`. Background regeneration can write after the request's pending promises have drained; those writes must still complete before the runtime ends the invocation.
