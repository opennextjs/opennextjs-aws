---
"@opennextjs/aws": patch
---

fix(pages-router): Add patch for trustHostHeader using res.revalidate

In pages router on Next 15 and 16 if you tried to `res.revalidate` you would run into this error: `Error: Failed to revalidate /path: Invariant: missing internal router-server-methods this is an internal bug`. This PR introduces a patch that always sets `context.trustHostHeader` as true in the runtime code.