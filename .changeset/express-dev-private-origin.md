---
"@opennextjs/aws": patch
---

fix(express-dev): include the port in `__NEXT_PRIVATE_ORIGIN`

The origin was built from `req.hostname`, which does not include the port. Requests sent by Next to its own origin (i.e. a forwarded Server Action) failed locally with `ECONNREFUSED`.
