---
"@opennextjs/aws": patch
---

fix: warn when traced files cannot be copied

Traced files that fail to copy were only logged at debug level. A single summary warning is now logged, and the build still succeeds.
