---
"@opennextjs/aws": patch
---

fix(ci): pin npm@11.5.1 to fix pre-release workflow

`npm install -g npm@latest` fails on Node 22 with "Cannot find module 'promise-retry'".
