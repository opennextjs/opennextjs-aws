---
"@opennextjs/aws": patch
---

fix(dev-overrides): Add automatic response cleanup via onClose callback

This changes will make `request.signal.onabort` work in route handlers for `node` and `express-dev` wrappers.