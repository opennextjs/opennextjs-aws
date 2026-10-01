---
"@opennextjs/aws": patch
---

Preserve Next.js route-scoped response cache keys across build assets, runtime storage, and tags. Cache interception now falls through to fixed Next.js versions because pre-routing pathname lookups cannot safely determine source-route ownership.
