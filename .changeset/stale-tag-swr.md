---
"@opennextjs/aws": patch
---

fix: serve entries marked stale by `revalidateTag(tag, "max")` with stale-while-revalidate

On Next.js 16.4+, a stale entry with `revalidate: false` was served as a hit until its tag expired, and a stale prerendered entry was revalidated in the foreground.
