---
"@opennextjs/aws": patch
---

fix: cache `notFound: true` results of `getStaticProps`

The cache handler used to delete the entry when Next.js stored a not found page, so every request re-ran `getStaticProps` and a `fallback: true` route served the fallback shell instead of the 404 page.

The not found result is now stored as a `{ type: "notFound" }` entry, with its lifetime, and served by Next.js as a cached 404 like with `next start`. Once its `revalidate` has passed, it is treated as a miss so that `getStaticProps` runs again before responding. Custom incremental cache overrides that inspect the entry `type` need to handle this new type.
