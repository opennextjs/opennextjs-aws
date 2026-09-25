---
"@opennextjs/aws": patch
---

Provide `waitUntil` from the AWS streaming wrappers

The `aws-apigw-streaming` and `aws-lambda-streaming` wrappers now pass a `waitUntil` to the request handler, backed by a set of pending promises awaited before the response stream closes. Previously only the Cloudflare wrappers provided `waitUntil`, so on AWS deferred work scheduled after the response body was sent (background revalidation, cache write-through) was not guaranteed to complete, and the `withWaitUntil` route preloading behaviour silently fell back to `none`. Both are now supported on AWS.
