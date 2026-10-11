---
"@opennextjs/aws": patch
---

fix: do not re-compress responses the app already encoded on Cloudflare

On Cloudflare Workers, a dynamic route handler can return a body it already compressed by creating its `Response` with `encodeBody: "manual"` and a `content-encoding` header such as `gzip` or `br`. That option was ignored: it was lost when the response was passed to the client, so workerd compressed the pre-encoded body a second time and clients received a double-encoded body they could not decode. In local development (`localhost`), the `content-encoding` header was also overwritten with `identity`, so clients received compressed bytes labelled as uncompressed.

`encodeBody: "manual"` is now honored for route handler responses and the `content-encoding` header set by the app is kept. Responses created without this option are unchanged.
