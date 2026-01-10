---
"@opennextjs/aws": patch
---

fix: find the correct output for the standalone output

Open Next assumes that standalone is based on the root of a monorepo, while Next uses `outputFileTracingRoot` to determine the root and path of .next/standalone. For example, take a monorepo like this:

```
apps/
  marketing/
    landing-pages/
      // next app

```

If you set `outputFileTracingRoot` in landing pages to ../, then the standalone output would be `.next/standalone/landing-pages`, but open-next will assume that the output is `.next/standalone/apps/marketing/landing-pages`.

This PR fixes that by actually looking at the standalone output and determining its structure by looking for `.next/standalone/dir/.next` and returning `.next/standalone/dir`.
