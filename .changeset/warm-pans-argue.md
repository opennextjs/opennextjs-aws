---
"@opennextjs/aws": patch
---

Some perf improvements : 
- Eliminate unnecessary runtime imports.
- Refactor route preloading to be either on-demand or using waitUntil or at the start or during warmerEvent.
- Add a global function to preload routes when needed.