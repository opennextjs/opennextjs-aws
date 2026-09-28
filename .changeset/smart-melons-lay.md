---
"@opennextjs/aws": patch
---

Only serve cached responses for GET and HEAD requests in the cache interceptor

A progressively enhanced form (`<form action={serverAction}>`, or one wired through `useActionState`) submitted before hydration or with JavaScript disabled is a plain `multipart/form-data` POST whose action id travels in the body, not in the `next-action` header. With `enableCacheInterception` on, the interceptor answered it with the cached page, so the server action never ran and the submission was lost. Requests other than GET and HEAD now reach `NextServer`, matching Next.js, which never serves a possible server action from the cache.

