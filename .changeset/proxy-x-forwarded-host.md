---
"@opennextjs/aws": patch
---

fix: do not relay the client `x-forwarded-host` to external rewrite upstreams

Like Next.js, the `node` and `fetch` external request proxies now set `x-forwarded-host` to the host of the incoming request instead of forwarding the value sent by the client.
