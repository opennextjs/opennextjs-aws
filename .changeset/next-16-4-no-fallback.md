---
"@opennextjs/aws": patch
---

Fix pages with `fallback: false` returning a 404 instead of falling through to a less specific dynamic route on Next.js 16.4.

Preserve existing fallback routing and parameter-decoding behavior on Next.js versions before 16.4.

Select the canonical App Page entry for fallback routes with parallel slots or route groups on Next.js 16.4+.

Return a 400 instead of a 500 when decoding the selected fallback route's parameters fails on Next.js 16.4+, matching Next.js's bad-request handling.

Match Next.js 16.4's six-attempt routing limit on 16.4+, allowing a valid sixth route candidate while preserving the existing five-attempt limit on older versions.
