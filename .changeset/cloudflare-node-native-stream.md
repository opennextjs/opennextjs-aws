---
"@opennextjs/aws": patch
---

fix(cloudflare-node): use native IdentityTransformStream for the response body

The `cloudflare-node` wrapper built the streamed response body from a JS-backed
`ReadableStream` with a manually captured controller, acknowledging writes
without backpressure. On deployed Workers this intermittently (20-35% of
requests in our reproduction) stalled mid-stream: the final flush(es) of
SSR/RSC responses were never delivered, the terminating chunk was never sent,
and the client connection stayed open indefinitely — browsers eventually
exhaust their per-origin connection pool and the whole site appears frozen.

Switching to the Workers-native `IdentityTransformStream` and awaiting
`writer.write()` provides runtime-managed pumping with real backpressure and
eliminates the stall (0 hangs in 80 requests after the change, measured on the
same production deployment).
