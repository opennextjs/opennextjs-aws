---
"@opennextjs/aws": patch
---

fix: copy `server/middleware.js` into the standalone dir on Next 16

Next 16 emits `server/middleware.js` (a stub when the app has no middleware) in the build dir but not in the standalone output, which made `copyTracedFiles` throw. Like for `server/instrumentation.js`, the file is now copied before it is asserted to exist.
