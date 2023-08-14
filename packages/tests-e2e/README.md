# End to End Integration Test

This e2e testing suite tries to cover different permutations and features that Nextjs provides to catch missing features and/or breaking changes.

The 3 permutations are:

1. App Dir only project
2. Pages only project
3. App Dir + Pages mixed project

Their respective `tests/` folders are:

1. [appDirOnly](./tests/appDirOnly)
2. [pagesOnly](./tests/pagesOnly)
3. [appDirAndPages](./tests//appDirAndPages)

Their respective `packages/` are located at:

1. [appDirOnly](/packages/app-dir)
2. [pagesOnly](/packages/pages-only)
3. [appDirAndPages](/packages/app-dir)

The GitHub actions will trigger the [e2e test](/.github/workflows//e2e.yml), which deploys the app in the [Example](/example/) folder. The deploy command is:

```
npx sst deploy --stage e2e
```

## Gotchas

`isr.test.ts` returns a timestamp, when running `next dev`, ISR does not cache so each reload is a new timestamp. You'll need to `next build` and `next start` for Next to not cache.
