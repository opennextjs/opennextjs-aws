---
"@opennextjs/aws": patch
---

fix: pass `--cpu` instead of `--arch` and drop `--target` when installing function dependencies

npm >= 11 rejects the `--arch` and `--target` flags, so the install failed and, because the error was only logged, the image optimization function deployed without `sharp`. npm also filters platform-specific optional dependencies (sharp's `@img/*` packages) by `--cpu`, so even on older npm the old flags installed binaries for the wrong architecture. `InstallOptions.nodeVersion` is kept but deprecated and no longer passed to npm.
