---
"@opennextjs/aws": patch
---

fix: skip the middleware trace files when the app has no middleware

Next 16 (Turbopack) emits `server/middleware.js.nft.json` and a `server/middleware.js` stub even when the app has no middleware, but the stub is not part of the standalone output, which made `copyTracedFiles` throw. The middleware branch is now skipped when neither the middleware manifest nor the functions config manifest registers a middleware.
