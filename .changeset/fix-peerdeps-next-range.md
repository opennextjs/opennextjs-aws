---
"@opennextjs/aws": patch
---

fix: exclude unsupported Next.js 16 releases from peer dependencies.

The previous range allowed Next.js 16.0.0 through 16.2.2 without a peer dependency warning because `>=16.2.3` was already covered by `>=15.5.15`.

The range now explicitly supports Next.js 15.5.15 and above in the 15.x line, and Next.js 16.2.3 and above in the 16.x line.
