---
"@opennextjs/aws": patch
---

Fix EACCES errors when building with read-only node_modules

Ensures copied files are writable after copying. This fixes build failures in environments like Bazel where node_modules files are read-only.
