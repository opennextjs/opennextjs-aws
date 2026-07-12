---
"@opennextjs/aws": patch
---

Preserve percent-encoding of query parameters in `getQueryFromSearchParams`

`getQueryFromSearchParams` iterated over `URLSearchParams.entries()`, which decodes the values. Since `convertToQueryString` does not re-encode them (by design, see #817), any query value containing reserved characters (`&`, `=`, `+`, spaces, ...) was corrupted when the query string was rebuilt for `req.url`. The parser now keeps the values encoded so they round-trip correctly through `convertToQueryString`.

Fixes opennextjs/opennextjs-cloudflare#1134.
