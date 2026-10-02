---
"@opennextjs/aws": patch
---

Apply `patchBackgroundRevalidation` to the compiled Next.js runtimes

Since Next 15.5 the route modules use their own `ResponseCache`, inlined and minified in `next/dist/compiled/next-server/*.runtime.prod.js`. The patch only targeted `server/response-cache/index.js` and matched the unminified `context.isPrefetch`, so these copies were left untouched and stale requests still triggered an in-process regeneration instead of only going through the revalidation queue.
