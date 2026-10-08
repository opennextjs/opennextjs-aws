---
"@opennextjs/aws": patch
---

Apply every matching `beforeFiles` rewrite in order so Next.js-generated
interception rewrites can run after user-defined rewrites. Preserve unused
source parameters in the rewritten query for subsequent rewrite conditions,
while keeping redirect query behavior unchanged.
