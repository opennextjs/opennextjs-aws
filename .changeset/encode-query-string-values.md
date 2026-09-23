---
"@opennextjs/aws": patch
---

fix: percent-encode query values when rebuilding the query string, so values containing "&", "=", "+" or "%" reach Next.js intact
