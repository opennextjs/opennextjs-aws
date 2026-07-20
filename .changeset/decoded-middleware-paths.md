---
"@opennextjs/aws": patch
---

Match middleware against decoded pathname equivalents and skip cache interception for malformed path encodings, in parity with Next.js, so percent-encoded routes cannot bypass middleware.
