---
"@opennextjs/aws": patch
---

fix: forwarded Server Actions on dynamic routes

A Server Action posted to a page that does not bundle it is forwarded by Next to a page that does, using the route pattern as the path (i.e. `/items/[id]/edit`). That request never reached the action: Lambda function URLs answer `400` to a path containing literal brackets and, since 4.1.15, the routing layer sends a path containing a dynamic segment placeholder to the 404 page. The client received "An unexpected response was received from the server" or "Failed to find Server Action".

The dynamic segments of the forwarded path are now replaced by `_forwarded-action` (i.e. `/items/_forwarded-action/edit`). A catch-all route shadowed by a dynamic sibling (i.e. `/docs/[...slug]` next to `/docs/[id]`) gets as many of them as it takes for the path to be routed to it.
