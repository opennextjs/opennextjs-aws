---
"@opennextjs/aws": patch
---

Fix stale entries being revalidated in a blocking way on Next.js 16.3

To flag a cache entry as stale, the incremental cache adapter reported a
`lastModified` of `1` (i.e. right after the epoch) to Next.js. Starting with
Next.js 16.3 the incremental cache also compares `lastModified + expire` to now
and forces a blocking revalidation (`x-nextjs-cache: REVALIDATED`) when that is
in the past, which an epoch based value always is. Stale entries were therefore
never served while revalidating in the background.

On Next.js 16.3 and above, stale entries now report a `lastModified` just past
their revalidate window, so they stay inside their expire window and are served
stale as intended. Earlier versions keep the previous behaviour.
