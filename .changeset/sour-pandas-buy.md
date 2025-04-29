---
"@opennextjs/aws": minor
---

Introduce support for the composable cache

BREAKING CHANGE: The interface for the Incremental cache has changed. The new interface use a Cache type instead of a boolean to distinguish between the different types of caches. It also includes a new Cache type for the composable cache. The new interface is as follows:

```ts
export type CacheEntryType = "cache" | "fetch" | "composable";

export type IncrementalCache = {
  get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType,
  ): Promise<WithLastModified<CacheValue<CacheType>> | null>;
  set<CacheType extends CacheEntryType = "cache">(
    key: string,
    value: CacheValue<CacheType>,
    isFetch?: CacheType,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  name: string;
};
```

NextModeTagCache also get a new function `getLastRevalidated` used for the composable cache: 

```ts
  getLastRevalidated(tags: string[]): Promise<number>;
```