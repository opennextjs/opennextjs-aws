---
"@opennextjs/aws": patch
---

fix: match `fallback: false` routes against decoded pathname equivalents, so a prerendered page whose slug contains a space or a non-ASCII character is served from the prerender cache instead of returning a 404.
