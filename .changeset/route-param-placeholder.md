---
"@opennextjs/aws": patch
---

fix: do not route requests with dynamic segment placeholder values

Requests binding a dynamic segment of an App Router page to its own placeholder (e.g. `[slug]` for `app/[slug]/page.tsx`, `[...slug]` or `[[...slug]]` for catch-all segments) are routed to the 404 page. Next.js versions before 16.4.5 treat such values as unresolved params.
