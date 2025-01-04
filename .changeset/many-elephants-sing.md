---
"@opennextjs/aws": patch
---

fix city name header encoding

- encode the header in cloudflare wrapper
- decode the header in the routing layer
