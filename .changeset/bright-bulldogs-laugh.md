---
"@opennextjs/aws": patch
---

Add aws-lambda-compressed wrapper

New wrapper called `aws-lambda-compressed`. The compression quality for brotli can be configured using the `BROTLI_QUALITY` environment variable. If not set, it defaults to 6.