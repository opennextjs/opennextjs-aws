---
"@opennextjs/aws": patch
---

Fix the `pattern-env` origin resolver so regex metacharacters (such as `.`) in patterns are matched literally and `**` matches an empty remainder.
