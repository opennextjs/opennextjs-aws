---
"@opennextjs/aws": patch
---

Make the SQS revalidation queue non-blocking via `waitUntil`

The `sqs` and `sqs-lite` queue overrides awaited the SQS `SendMessage` on the request path, so enqueuing a stale-page revalidation held up the response until SQS acknowledged. When a `waitUntil` is available on the request store, the send is now handed to it and `send` returns immediately, so the SQS round trip runs after the body is flushed. Without a `waitUntil` (edge, or a wrapper that does not provide one) it still awaits inline, so behaviour is unchanged there.
