---
"@opennextjs/aws": minor
---

fix: support absolute paths for OpenNext config compilation utility

`compileOpenNextConfig` will now support the ability to pass in either absolute or relative paths, instead of treating any input as a relative path.
