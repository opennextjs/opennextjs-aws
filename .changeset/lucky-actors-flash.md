---
"@opennextjs/aws": patch
---

fix(cloudflare): PPR in wrangler dev

PPR works fine when deployed but not in dev because of bug in miniflare.
Adding a workaround until the bug is fixed upstream.
