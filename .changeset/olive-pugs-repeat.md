---
"@opennextjs/aws": patch
---

Report the lifetime of a cache entry to Next.js

Next.js takes an entry's lifetime from a per-route record that only the instance
which rendered the page has filled, with the prerender manifest as a fallback. A
page rendered on demand by a dynamic route is in neither, so Next.js fell back to
`revalidate: 1` and every other instance reported the entry as stale one second
after it was written. In practice no on-demand page stayed cached: most requests
served a stale entry and enqueued a revalidation.

`set` already stored `ctx.cacheControl.revalidate`; `expire` is now stored
alongside it, and `get` reports both. From Next.js 16.4 the lifetime is returned
as `cacheControl`, which `IncrementalCache.get` prefers over its own record.
Next.js 15.5 ignores a returned `cacheControl`, so there the lifetime is written
to that record directly instead.

Build time entries are unchanged: they carry no lifetime and need none, the
prerender manifest has it.
