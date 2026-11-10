---
"@opennextjs/aws": patch
---

chore: update `@node-minify/core` and `@node-minify/terser` to 10.5

Version 9 of `@node-minify/core` pins `glob@10.3.3`, which `npm audit` reports as GHSA-5j98-mcp5-4vw2. Version 10.5 does not depend on `glob`. Files that minify to an empty output (i.e. empty or comment-only files) are no longer reported as failed, because version 10 rejects empty output by default.
