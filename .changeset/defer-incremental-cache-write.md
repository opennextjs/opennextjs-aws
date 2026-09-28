---
"@opennextjs/aws": patch
---

fix: defer incremental cache writes so they do not block the response

`Cache.set` awaited the store write and the tag update, so both landed in the TTFB. Next.js
awaits `incrementalCache.set` in `response-cache/index.js` while it produces the response and
does not use the returned value.

The write is now registered on the request's pending promise runner, which hands it to
`waitUntil` when the wrapper provides one and awaits it before the handler returns otherwise.
`FETCH` entries keep being awaited: Next.js writes them from a detached chain of its own, and
that chain keeps the entry alive only while `set` does not return before it is stored.

Errors are still caught and logged, and the tag update still runs after the entry is written.
