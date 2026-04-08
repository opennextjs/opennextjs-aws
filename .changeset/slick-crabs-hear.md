---
"@opennextjs/aws": minor
---

Add support for SWR (stale-while-revalidate) in `revalidateTag`

Introduces a new optional method `isStale` in the tag cache for both the original and the next modes. The implementation is mandatory for SWR to work.

It also introduces a `RequestCache` utility that can be used to cache things scoped to a request (stored in the OpenNext internal AsyncLocalStorage context)

### BREAKING CHANGE

`writeTags` for the tag cache signature has changed to `writeTags(tags: NextModeTagCacheWriteInput[]): Promise<void>` for Next mode, and `writeTags(tags: OriginalTagCacheWriteInput[]): Promise<void>` for the original mode.
This is breaking only for custom tag cache implementations, if you are using the default one provided by OpenNext, you don't need to do anything.

`globalThis.isNextAfter15` is no longer available in the cache.