---
"@opennextjs/aws": patch
---

Add additional metadata to RoutingResult

For some future features [#658](https://github.com/opennextjs/opennextjs-aws/issues/658) (and bug fix [#677](https://github.com/opennextjs/opennextjs-aws/issues/677)) we need to add some additional metadata to the RoutingResult. 
This PR adds 2 new fields to the RoutingResult: `initialPath` and `resolvedRoutes`