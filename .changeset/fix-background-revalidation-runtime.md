---
"@opennextjs/aws": patch
---

Apply `patchBackgroundRevalidation` to the compiled Next.js runtimes

Since Next 15.5 the route modules use their own `ResponseCache`, inlined and minified in `next/dist/compiled/next-server/*.runtime.prod.js`. The patch only targeted `server/response-cache/index.js` and matched the unminified `context.isPrefetch`, so these copies were left untouched and stale requests still triggered an in-process regeneration instead of only going through the revalidation queue.

Also patch copies embedded in generated server chunks and route entries, including minified identifiers containing `$`. Otherwise Turbopack builds can still regenerate in-process despite the installed Next runtimes being patched.
