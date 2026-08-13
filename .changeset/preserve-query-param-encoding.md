---
"@opennextjs/aws": patch
---

Preserve percent-encoding of query parameters in `getQueryFromSearchParams` and `convertToQuery`

Both query parsers read values through `URLSearchParams`, which decodes them. Since `convertToQueryString` does not re-encode them (by design, see #817), any query value containing reserved characters (`&`, `=`, `+`, spaces, ...) was corrupted when the query string was rebuilt — for `req.url` in the request handler, and for the origin `querystring` in the CloudFront converter. The parsers now keep the values encoded so they round-trip correctly through `convertToQueryString`.

`getQueryFromSearchParams` covers the `node` and `edge` converters; `convertToQuery` covers the `aws-apigw-v2` and `aws-cloudfront` converters.

Fixes opennextjs/opennextjs-cloudflare#1134.
