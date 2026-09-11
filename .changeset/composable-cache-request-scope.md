---
"@opennextjs/aws": patch
---

fix: scope the composable cache's pending writes to the request, not the isolate

The map of in-flight `'use cache'` writes was module-scoped. On a runtime that serves many concurrent requests from one isolate (e.g. Cloudflare Workers) a pending write promise from one request could be handed to another; if the first request's context was torn down before the write settled, the second hung and the key stayed poisoned for the life of the isolate. The map now lives in the per-request `RequestCache`.
