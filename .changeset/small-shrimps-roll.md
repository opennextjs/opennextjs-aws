---
"@opennextjs/aws": patch
---

Check for supported Next version

The build will now error for unsupported Next version which may contain unpatched security vulnerabilities.
You can bypass the check using the `--dangerously-use-unsupported-next-version` flag.
