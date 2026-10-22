---
"@opennextjs/aws": patch
---

fix: read the incremental cache once per request when cache interception is enabled

`cacheInterceptor` read the incremental cache and dropped the result on a miss or a revalidated entry,
so the cache handler read the same key again once the server started. With an external middleware
(`@opennextjs/cloudflare` always uses one) that is two store round-trips per miss, ~280 ms each in the
traces of #1214.

The interceptor's read is now memoized for the request. Because the middleware handler and the server
handler do not share a request context in external middleware mode, that mode carries the miss decision
over with the internal `x-opennext-cache-miss` header, which is only read when `middleware.external` is
configured and is stripped from incoming requests. Writes and deletes clear the memoized key.
