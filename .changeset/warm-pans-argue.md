---
"@opennextjs/aws": patch
---

Some perf improvements : 
- Eliminate unnecessary runtime imports (i.e. dev react dependencies and next precompiled dev or turbopack dependencies)
- Refactor route preloading to be either on-demand or using waitUntil or at the start or during warmerEvent.
- Add a global function to preload routes when needed.