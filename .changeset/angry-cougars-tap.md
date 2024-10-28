---
"@opennextjs/aws": patch
---

fix(middleware): always compiles the middleware.

Prior to this PR the middleware would only be compiled when a middleware.ts exists.
