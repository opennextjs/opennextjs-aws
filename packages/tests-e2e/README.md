# End to End Integration Test

This e2e testing suite tries to cover different permutations and features that Nextjs provides to catch missing features and/or breaking changes.

The 3 permutations are:

1. App Router project
2. Pages Router project
3. App + Pages Router project

Their respective `tests/` folders are:

1. [appRouter](./tests/appDirOnly)
2. [pagesRouter](./tests/pagesOnly)
3. [appPagesRouter](./tests//appDirAndPages)

Their respective `packages/` are located at:

1. [appRouter](/examples/app-router)
2. [pagesRouter](/examples/pages-router)
3. [appPagesRouter](/examples/app-pages-router)

The GitHub actions will trigger the [e2e test](/.github/workflows//e2e.yml), which deploys the app in the [Example](/example/) folder. The deploy command is:

### Running the tests against the deployed app

1. Deploy the app
```bash
cd examples/sst
npx sst deploy --stage e2e
```
2. Export the URLS
```bash
export APP_ROUTER_URL=$(jq -r '.["e2e-example-AppRouter"].url' .sst/outputs.json)
export PAGES_ROUTER_URL=$(jq -r '.["e2e-example-PagesRouter"].url' .sst/outputs.json)
export APP_PAGES_ROUTER_URL=$(jq -r '.["e2e-example-AppPagesRouter"].url' .sst/outputs.json)
```
3. Run the test
```bash
cd ../../packages/tests-e2e
pnpm run e2e:dev
```


## Gotchas

`isr.test.ts` returns a timestamp, when running `next dev`, ISR does not cache so each reload is a new timestamp. You'll need to `next build` and `next start` for Next to not cache.
