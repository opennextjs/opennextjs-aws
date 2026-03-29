---
"@opennextjs/aws": minor
---

Add support for stale-while-revalidate in revalidateTag

Introduces a new methods in the tag cache (hasBeenStale, optional), both for the original and the next mode tag cache, mandatory to make swr work.

It also introduces a RequestCache utils that can be used to cache things scoped to a request (stored in the OpenNext internal AsyncLocalStorage context)

### BREAKING CHANGE

`writeTags` for the tag cache signature has changed to `writeTags(tags: NextModeTagCacheWriteInput[]): Promise<void>;` for Next mode, and `writeTags(tags: OriginalTagCacheWriteInput[]): Promise<void>;` for the original mode.