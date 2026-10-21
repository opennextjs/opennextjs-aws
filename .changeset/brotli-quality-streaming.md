---
"@opennextjs/aws": patch
---

fix: honor `BROTLI_QUALITY` in the `aws-lambda-streaming` wrapper and default it to 6

The streaming wrapper compressed every Brotli response at quality 11, which costs an order of magnitude more CPU than quality 6 for a few percent smaller output and delays the first byte of every response. The `aws-lambda-compressed` wrapper meant to default to 6 but used quality 0 when `BROTLI_QUALITY` was unset (`Number(undefined) ?? 6` is `NaN`).
