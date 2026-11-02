---
"@opennextjs/aws": patch
---

fix: apply the trailing slash redirect to API routes

Like Next.js, `/api/*` paths are now redirected to their canonical form (with or without a trailing slash, depending on `trailingSlash`) before the middleware runs.
Previously the middleware could see a non-canonical pathname, e.g. `/api/admin/`, and checks comparing the exact pathname could be bypassed.

The `__nextDataReq` query parameter no longer prevents the trailing slash redirect. Like Next.js, only `/_next/data` requests are not redirected.

Behavior change: requests to a non-canonical `/api/*` path (e.g. `/api/webhook/` with the default `trailingSlash: false`) now receive a `308` redirect instead of reaching the route. Clients that don't follow redirects, such as some webhook senders, must use the canonical URL.
