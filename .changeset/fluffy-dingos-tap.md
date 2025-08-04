---
"@opennextjs/aws": patch
---

fix: Normalize the Location header in redirects

Normalizes the Location header to either be a relative path or a full URL.
If the Location header is relative to the host, it will return a relative path.
If it is an absolute URL, it will return the full URL.
We want to match the behavior of `next start`.
Query parameters in redirects from Next Config are encoded, but from the middleware they are not touched.