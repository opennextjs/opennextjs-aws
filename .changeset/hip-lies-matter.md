---
"@opennextjs/aws": patch
---

fix: Workaround for broken symlink dereferencing in Node 22.17.0 and 22.17.1

The `dereference: true` option in `fs.cpSync()` is broken on version 22.17.0 and 22.17.1. This fix will do it manually for the binaries in `node_modules/.bin`. We can revert this once fixed upstream.

Issue in Node: https://github.com/nodejs/node/issues/59168