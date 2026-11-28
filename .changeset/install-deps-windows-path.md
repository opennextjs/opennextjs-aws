---
"@opennextjs/aws": patch
---

fix: install the image optimization dependencies (sharp) when building on Windows

`installDependencies` named its temp directory after `outputDir.split("/").pop()`. With the `\` separators of Windows, that kept the whole path (including the drive letter) in the name, so `mkdtempSync` failed with `ENOENT`. The error was only logged, so the build succeeded but the image optimization function was bundled without `sharp` and `/_next/image` returned a 500.

The name is now taken with `path.basename()`.
