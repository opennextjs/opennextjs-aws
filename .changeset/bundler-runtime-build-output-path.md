---
"@opennextjs/aws": patch
---

Fix `getBundlerRuntime` ignoring `buildOutputPath`

`getBundlerRuntime` looked for the Next.js server output under `appPath`, which
is always the project root and does not follow the `buildOutputPath` config.
Every other consumer of the Next.js build output (`getBuildId`,
`copyEnvFile`, `createServerBundle`, …) resolves it from `appBuildOutputPath`.

As a result, setting `buildOutputPath` to anything other than `.` failed the
build with `Unable to determine Next.js runtime (webpack or turbopack)` as soon
as the project root no longer contained a stale `.next` directory.
