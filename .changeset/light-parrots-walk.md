---
"@opennextjs/aws": minor
---

fix page router json data for next 15.2

This PR also use `getRequestHandlerWithMetadata` instead of `getRequestHandler` to allow assign metadata to the request.

BREAKING CHANGE: `MiddlewareResult` now contains `initialURL` instead of `initialPath`