---
"@opennextjs/aws": patch
---

fix: require a path separator after the buildId in `/_next/data` requests

A request is handled as a data request only when its path starts with `<basePath>/_next/data/<buildId>/`. Any other path under `<basePath>/_next/data/` now gets a 404, including with a basePath.

The rewritten data request URL is also built from the original origin so that the path can never change it.
