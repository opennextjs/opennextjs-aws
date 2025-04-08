---
"@opennextjs/aws": patch
---

Add aws-lambda-compressed wrapper

Introduces a new wrapper called `aws-lambda-compressed`. Will compress the response body by default. Compression will be applied in the following priority order: br (Brotli) → gzip → deflate. If none of these is found, we just return the body as is.

The compression quality for brotli can be configured using the `BROTLI_QUALITY` environment variable. If not set, it defaults to 6.
