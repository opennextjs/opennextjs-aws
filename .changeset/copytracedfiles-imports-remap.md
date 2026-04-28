---
"@opennextjs/aws": patch
---

fix: include `package.json#imports` subpath remap targets in traced files.

Next's NFT tracer does not follow the `imports` field, so packages only reachable via remaps (e.g. `@mathjax/src`'s `#mhchem/*` → `mhchemparser/esm/*`) were missing from the server bundle. `copyTracedFiles` now scans traced package.json files for an `imports` field and pulls in any bare-specifier remap targets from source.

Workaround for upstream issue https://github.com/vercel/next.js/issues/93295.
