---
"@opennextjs/aws": patch
---

Forward `images.dangerouslyAllowLocalIP` to `fetchExternalImage` on Next.js 16 instead of hardcoding `false`, so external images served from hosts resolving to private IPs (e.g. an internal media proxy) can be optimized again when the user has explicitly opted out of the SSRF guard in their Next.js config.
