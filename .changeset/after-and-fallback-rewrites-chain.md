---
"@opennextjs/aws": patch
---

fix: apply every matching afterFiles and fallback rewrite

`afterFiles` and `fallback` rewrites stopped at the first match, so a rule whose destination matched a later rule in the same phase was never applied. Next.js keeps evaluating the rules of a phase in order, the way this now does for `beforeFiles` too.
