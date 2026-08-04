---
"@opennextjs/aws": patch
---

Fix `server/instrumentation.js does not exist` build failure on Next.js 16

On Next.js 16 the standalone output no longer copies `server/instrumentation.js`
into the standalone directory, but `copyTracedFiles` copies the instrumentation
`.nft.json` trace and then asserts the `.js` file exists in the standalone dir,
throwing `File server/instrumentation.js does not exist` during the server
bundle. The instrumentation file is now copied from the build dir into the
standalone dir (mirroring the existing `.nft.json` copy) so the assertion passes
and the file ships in the bundle.
