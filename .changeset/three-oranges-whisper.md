---
"@opennextjs/aws": patch
---

refactor: `compileOpenNextConfig` now takes `openNextConfigPath` only and no more `baseDir`.

`openNextConfigPath` is now in line with fs APIs: it is either absolute or relative to the working directory (`cwd`).
