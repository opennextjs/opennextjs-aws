---
"@opennextjs/aws": patch
---

refactor `compareSemver`.

It now takes a comparison operator and return a boolean, i.e. `compareSemver("1.0", "<=", "1.2.3")`
