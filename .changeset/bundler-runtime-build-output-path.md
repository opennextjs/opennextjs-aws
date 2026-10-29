---
"@opennextjs/aws": patch
---

fix: respect `buildOutputPath` when detecting the Next.js bundler (webpack or turbopack)

Setting `buildOutputPath` to a value other than `.` could fail the build with `Unable to determine Next.js runtime (webpack or turbopack)`.
