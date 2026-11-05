---
"@opennextjs/aws": patch
---

Copy server source maps next to the traced server files

Next.js only copies the files listed in the `.nft.json` traces into `.next/standalone`, and those traces never include `.js.map` files. With `experimental.serverSourceMaps` enabled, the maps were therefore left behind in `.next` and production stack traces could not be symbolicated. The `.map` sitting next to each traced JavaScript file in `.next` is now copied alongside it into the `.open-next` output. Source maps shipped by packages in `node_modules` are not copied.
