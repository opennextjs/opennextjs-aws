---
"@opennextjs/aws": patch
---

perf: parallelize build bundle creation

Parallelize independent bundle creation operations (`createServerBundle`, `createRevalidationBundle`, `createImageOptimizationBundle`, `createWarmerBundle`) using `Promise.all`. Each bundle writes to separate directories, making them safe to run concurrently. This should improve build time by running esbuild bundling and file system operations in parallel.
