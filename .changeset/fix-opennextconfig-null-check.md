---
"@opennextjs/aws": patch
---

fix: add null check for globalThis.openNextConfig in cache handler

Adds optional chaining when accessing globalThis.openNextConfig to prevent
TypeError during Next.js 16 build phase when using the Adapters API. The cache
handler can be instantiated during SSG/prerendering before openNextConfig is
initialized by the runtime handlers.
