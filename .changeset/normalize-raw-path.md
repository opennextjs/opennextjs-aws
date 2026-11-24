---
"@opennextjs/aws": patch
---

fix: match the middleware against the normalized pathname

The request path is normalized with the URL parser before routing, as Next.js 16 does: dot segments (`..`, `%2e%2e`, ...) are resolved, a raw backslash is handled as a slash, and tabs, new lines and a raw `#fragment` are removed. The middleware, `headers()` and `redirects()` then apply to the path that is served.

- A path ending with a dot segment (e.g. `/page/.`) gets the trailing slash redirect.
- A data request whose page path is not normalized once `.json` is removed (e.g. `/_next/data/<buildId>/page/..json`) is answered with a 404.
- A data request redirected to its page because of a trailing slash no longer keeps the internal `__nextDataReq` query parameter in the location, and a query containing a second `?` is no longer cut.

No change is required in application code.
