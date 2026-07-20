---
"@opennextjs/aws": patch
---

Match middleware and its bundled route lookup against decoded pathname equivalents, while preserving the encoded request URL. Skip cache interception for malformed path encodings, in parity with Next.js, so percent-encoded routes cannot bypass middleware.
