---
"@opennextjs/aws": minor
---

fix: support absolute paths for OpenNext configs

Compiling OpenNext configs will now support the ability to pass in either absolute or relative paths, instead of treating any input as a relative path.

Further, the CLI will now treat absolute paths as absolute, instead of always treating them as relative. Relative paths should not start with a `/`, i.e. you should use `./config-path.ts` instead of `/config-path.ts`.
