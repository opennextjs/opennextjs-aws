---
"@opennextjs/aws": patch
---

fix: copy traced chunks that Next omits from the standalone output

On Next.js 16 Turbopack builds, `next build` can leave chunks out of the standalone output when only `app/_global-error/page.js` or `app/_not-found/page.js` trace them. The same copy path drops instrumentation chunks when an older Next.js standalone build omits them. OpenNext copied traced files only from `.next/standalone` and ignored a missing file, so those routes threw `ChunkLoadError` at runtime and returned HTTP 500.

Traced files that are missing from standalone and live under the app's `.next` directory are now copied from there. Files outside `.next`, including `node_modules`, are unchanged. Node middleware is traced only when `/_middleware` is registered in `functions-config-manifest.json`, matching the middleware build. A Turbopack `server/middleware.js.nft.json` stub for an app with no middleware no longer fails the build.
