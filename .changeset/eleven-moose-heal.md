---
"@opennextjs/aws": patch
---

fix: Add automatic response cleanup via AbortSignal

These changes will make `request.signal.onabort` work in route handlers for `node`, `cloudflare-node` and `express-dev` wrappers.