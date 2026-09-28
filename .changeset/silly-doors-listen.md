---
"@opennextjs/aws": patch
---

fix: serve segment prefetches from the cache interceptor on Next 16

The segment response branch was gated on `!NextConfig.experimental.prefetchInlining`.
Next normalizes every truthy `prefetchInlining` into `{ maxSize, maxBundleSize }` and
enables it by default since 16.2, so the negation was always `false` and the branch was
unreachable: every `Next-Router-Segment-Prefetch` request was answered with the full page
payload. The router never recorded the prefetch as satisfied and re-requested it
indefinitely.

The gate is gone. Inlining only changes *which* segments the build emits - an emitted
segment then being a bundle that already holds its inlined ancestors - and `segmentData`
holds exactly those, which is exactly the set the router asks for. When the entry holds
segments but not the requested one, the interceptor now falls back to the server, which
answers with the empty 404 Next would, instead of a payload of a different shape.

Also fixed in the same expression: the header was template stringified, so a missing one
became the literal `"undefined"` and the `Boolean()` guard was always true; and membership
was tested with `in`, which matches inherited keys, so a
`next-router-segment-prefetch: constructor` request resolved to a function off
`Object.prototype`. `prefetchInlining` is now typed as
`boolean | { maxSize: number; maxBundleSize: number }` to match what Next emits.
