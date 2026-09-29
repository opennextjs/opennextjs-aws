---
"@opennextjs/aws": patch
---

Fix `npm install` flags used to install the image optimization function's dependencies (sharp)

`installDependencies` built its cross-platform install command with `--arch` and `--target`, e.g. `npm install --os=linux --arch=arm64 --target=18 --libc=glibc sharp@0.32.6`. npm 11 dropped both flags in favor of `--cpu` (the current name for the `arch` config) and has no replacement for `--target`, since npm's package.json-based `os`/`cpu`/`libc` platform matching — which is what selects sharp's prebuilt binary — was never tied to a Node version. On npm 11+, the install now fails outright with `EUNKNOWNCONFIG: Unknown cli flags: --arch, --target`, so the image optimization function silently ships without `sharp`.

The fix renames `--arch` to `--cpu` and stops passing `--target`. `nodeVersion` on `InstallOptions` is now a no-op and marked deprecated rather than removed, so it's non-breaking for anyone passing a custom `install` config.
