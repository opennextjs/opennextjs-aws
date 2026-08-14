---
"@opennextjs/aws": patch
---

Pass `process.env` explicitly when spawning the Next.js build

`setStandaloneBuildMode` communicates with the Next.js build by mutating
`process.env` (`NEXT_PRIVATE_STANDALONE`, `NEXT_PRIVATE_OUTPUT_TRACE_ROOT`)
immediately before `buildNextjsApp` spawns it. Node forwards those mutations to
the child process by default, but Bun builds the child environment from a
snapshot taken at startup unless `env` is passed explicitly, so the build never
enters standalone mode. The failure surfaces much later in `createCacheAssets`
as `ENOENT ... .next/standalone/.next/server/pages-manifest.json`, which gives
no hint of the real cause. Passing `env: process.env` makes both runtimes
behave the same.
