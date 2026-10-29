---
"@opennextjs/aws": patch
---

fix: pass `--cpu` instead of `--arch` and drop `--target` when installing function dependencies

npm 12 rejects (npm 11 warns) the `--arch` and `--target` flags, so the install failed and, because the error was only logged, the image optimization function deployed without `sharp`. npm filters platform-specific optional dependencies (sharp's `@img/*` packages) by `--cpu`, so `arch` is now passed as `--cpu`. `InstallOptions.nodeVersion` is kept but deprecated and no longer passed to npm.
