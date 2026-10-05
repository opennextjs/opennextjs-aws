# Background revalidation patch integration test

This small app exercises App Router pages, route handlers and Pages Router ISR.
It avoids external data/fonts so both production bundlers can be tested locally.

From the repository root:

```sh
pnpm --filter @opennextjs/aws build
NEXT_BUNDLER=turbopack pnpm --filter isr-patching test:patches
NEXT_BUNDLER=webpack pnpm --filter isr-patching test:patches
```

The check compares unpatched standalone sources with files shipped by the real
OpenNext build. It discovers stale/prefetch conditions independently of the
production patch filters, including generated chunks. Restoring the PR's
runtime-only filename filter must make the Turbopack check fail.
