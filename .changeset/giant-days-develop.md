---
"@opennextjs/aws": patch
---

fix(http): Set content-length only if body is present

The body is undefined when using the edge converter and the method is GET or HEAD
