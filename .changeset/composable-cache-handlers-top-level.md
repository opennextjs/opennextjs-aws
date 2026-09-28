---
"@opennextjs/aws": patch
---

Register the composable cache handler at the top-level `cacheHandlers` config key for Next.js 16

Next.js 16 promoted `cacheHandlers` out of `experimental` to a top-level config key. At runtime `loadCustomCacheHandlers` reads `nextConfig.cacheHandlers`, so the handler OpenNext injected only under `experimental.cacheHandlers` was ignored on Next >= 16 — the composable (`use cache`) path fell back to Next's in-memory default handler and never reached the configured incremental cache override, so composable entries were never persisted. The handler is now registered at the top level as well (the `experimental` copy is kept for older Next versions).
