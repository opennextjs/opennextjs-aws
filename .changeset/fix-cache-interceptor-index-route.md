---
"@opennextjs/aws": patch
---

Fix cache interception for index routes by normalizing the route path to `/` while reading the generated cache asset from `/index`.
