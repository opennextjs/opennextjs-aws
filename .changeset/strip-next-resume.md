---
"@opennextjs/aws": patch
---

fix: strip the internal `next-resume` header from incoming requests

The internal `next-resume` header is now stripped from incoming requests, matching Next.js.
