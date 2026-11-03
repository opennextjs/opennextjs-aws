---
"@opennextjs/aws": patch
---

fix: do not forward stale framing headers to the Node.js response

The `node` and `express-dev` wrappers no longer trust the `content-length` and `transfer-encoding` headers set by the app:

- `transfer-encoding` is always removed, Node.js picks the transfer coding.
- A `content-length` that is not a valid length (e.g. `abc`, `-1`, `4, 4`) is removed.
- `content-length` is kept for HEAD requests and 304 responses.
- Otherwise `content-length` is only kept when the body has exactly the declared length. The body is buffered (up to 10 MB) until this is known. When the length doesn't match, or is larger than 10 MB, `content-length` is removed and Node.js frames the body itself (e.g. chunked on HTTP/1.1).

Responses without a `content-length` (e.g. streamed pages) are still streamed. Responses with a `content-length` up to 10 MB are now sent once the whole body is received, so a slow body with a declared length (e.g. a `fetch()` response returned by a middleware) no longer streams. CloudFront only compresses responses with a `content-length`, so it keeps compressing those.
