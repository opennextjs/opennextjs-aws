---
"@opennextjs/aws": patch
---

fix: do not copy `next.config` headers onto the request headers

Like Next.js, `next.config` `headers()` now only go on the response, while the middleware response headers go on both the response and the request. A `Content-Security-Policy` in `next.config` no longer replaces the one the middleware set on the request, so Next.js finds the nonce and adds it to its scripts.

`next.config` header names are now lowercased, so a `next.config` header and a middleware header that only differ by case (e.g. `X-Foo` and `x-foo`) end up as a single response header.

Behavior change: `headers().get()` no longer returns a header that only `next.config` `headers()` sets, and external rewrites no longer forward it to the upstream.
