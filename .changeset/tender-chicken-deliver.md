---
"@opennextjs/aws": patch
---

When copying over assets, check to see if favicon.ico is a file. In some cases favicon.ico is a folder that can contain a route handler.
