---
"@opennextjs/aws": patch
---

fix: remove `cf-connecting-ip` headers from external override requests

this change removes `cf-connecting-ip` headers from requests being sent to
external urls during rewrites, this allows such overrides, when run inside a
Cloudflare worker to rewrite to urls also hosted on Cloudflare
