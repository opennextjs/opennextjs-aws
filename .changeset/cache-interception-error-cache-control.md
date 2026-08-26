---
"@opennextjs/aws": patch
---

Stop the cache interceptor from serving cached 404 and 500 responses with a cacheable `cache-control`.

`notFound()` results on ISR routes are written to the incremental cache by Next.js, and the interceptor served them with the entry's own `cache-control` — up to `s-maxage=31536000` for a route that declares no `revalidate`. A transient 404 could therefore be held at the CDN for a year. The interceptor now applies the same override the server path already applies in `OpenNextNodeResponse.fixHeadersForError`, which it was bypassing by returning a result directly. As on the server path, only 404 and 500 are overridden, and `OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS=true` opts out.
