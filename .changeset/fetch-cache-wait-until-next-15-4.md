---
"@opennextjs/aws": patch
---

fix: keep the runtime alive until fetch cache entries are written on Next.js 15.4+

Since Next.js 15.4, `fetch` writes its cache entry from `const cacheSetPromise = cloned1.arrayBuffer().then(...)`. The `patchFetchCacheSetMissingWaitUntil` patch only matched the shapes emitted by earlier versions, so it silently stopped applying. The background write could then be dropped when the invocation ended: entries using `fetch(url, { next: { revalidate } })` were never refreshed once stale. This shows on deployed Cloudflare Workers, while `wrangler dev` keeps the dropped promises alive and hides it.

The patch now matches that assignment too. It registers the write with the runtime `waitUntil` when the wrapper provides one (i.e. `ctx.waitUntil` on Cloudflare), and falls back to the request's pending promise runner otherwise. The runtime `waitUntil` also covers writes that start late, during the background revalidation of a stale entry.
