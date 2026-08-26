import type {
  CacheValue,
  NextModeTagCacheWriteInput,
  OriginalTagCacheWriteInput,
  WithLastModified,
} from "types/overrides";
import { debug } from "../adapters/logger";
import { compareSemver } from "./semver";
/**
 *
 * @param key The key for that specific cache entry
 * @param tags Array of tags associated with that cache entry
 * @param lastModified Time of the last update to the cache entry
 * @returns A boolean indicating whether the cache entry has become stale -
 * A cache entry is considered stale if at least one of its associated tags has been revalidated since the `lastModified` time, but none of them has expired yet.
 * In this case, the cache entry is still valid and can be served, but it should trigger a background revalidation to update the cache.
 */
export async function isStale(
  key: string,
  tags: string[],
  lastModified?: number,
): Promise<boolean> {
  // SWR for revalidateTag has been implemented starting from Next.js 16
  if (!compareSemver(globalThis.nextVersion, ">=", "16.0.0")) {
    return false;
  }
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0
      ? false
      : ((await globalThis.tagCache.isStale?.(tags, lastModified)) ?? false);
  }
  return (await globalThis.tagCache.isStale?.(key, lastModified)) ?? false;
}

/**
 * Next.js has no explicit way for a cache handler to report an entry as stale,
 * the only lever we have is the `lastModified` we hand back to the incremental cache.
 *
 * Up to Next 16.2 we return `1` (i.e. right after the epoch), which is enough for Next to
 * compute `revalidateAfter` in the past and mark the entry as stale.
 * Starting with Next 16.3 the incremental cache also compares `lastModified + expire` to now, and
 * forces a blocking revalidation (`isStale === -1`, surfacing as `x-nextjs-cache: REVALIDATED`)
 * when that is in the past. An epoch based value always trips that check, so from that version on
 * we go back just far enough for the entry to be stale while remaining inside its expire window.
 *
 * @param revalidate The revalidate value stored alongside the cache entry, in seconds
 * @returns The `lastModified` to report to Next.js for a stale entry
 */
export function getStaleLastModified(revalidate?: number | false): number {
  // The `expire` check only exists from Next 16.3, before that the sentinel is what Next expects.
  if (!compareSemver(globalThis.nextVersion, ">=", "16.3.0")) {
    return 1;
  }
  if (typeof revalidate !== "number") {
    // Without a revalidate value Next cannot derive an expire time either,
    // so the historical sentinel is still safe here.
    return 1;
  }
  // 1ms past the revalidate window. `expire` is always >= `revalidate`, so the entry is
  // stale without being expired (when both are equal, being expired is the correct outcome).
  return Date.now() - revalidate * 1000 - 1;
}

/**
 * The part of Next.js' `IncrementalCache` we need to reach the per route cache controls.
 * Next.js assigns the instance handling the current request to `globalThis.__incrementalCache`
 * (in `base-server`), which is the only reliable way to get to it:
 * both `SharedCacheControls` and `SharedRevalidateTimings` keep their map in a **static** class
 * field, so importing the module ourselves risks writing into a second copy of that map if the
 * bundler ever duplicates the module.
 *
 * Next.js 15.2.1 and above expose `cacheControls` (a `SharedCacheControls`) holding
 * `{ revalidate, expire }`, earlier versions exposed `revalidateTimings`
 * (a `SharedRevalidateTimings`) holding a bare number. Both are optional so that an
 * unrecognised shape is a no-op rather than a wrong write.
 */
type NextIncrementalCacheInternals = {
  cacheControls?: {
    get?: (
      route: string,
    ) => { revalidate: number | false; expire?: number } | undefined;
    set?: (
      route: string,
      cacheControl: { revalidate: number; expire: number | undefined },
    ) => void;
  };
  revalidateTimings?: {
    get?: (route: string) => number | false | undefined;
    set?: (route: string, revalidate: number) => void;
  };
};

/**
 * Mirrors Next.js' own `toRoute`: the route key it looks cache controls up under is the cache key
 * without its trailing `/index` and without a trailing slash.
 */
function toRouteKey(pathname: string): string {
  return pathname.replace(/(?:\/index)?\/?$/, "") || "/";
}

/**
 * Next.js resolves the TTL of a route from `IncrementalCache#cacheControls`, a process wide map
 * fed only by `IncrementalCache#set` and by the prerender manifest. A page rendered on demand
 * (Pages Router `getStaticPaths` returning `paths: []` with a `fallback`, or any path not
 * enumerated at build time) is in neither: the manifest has no entry for the concrete path
 * (`dynamicRoutes` is keyed by the route *pattern*), and the map is only warm on the instance that
 * happened to render that exact path. `IncrementalCache#calculateRevalidate` then falls back to a
 * hardcoded one second (`cacheControl ? cacheControl.revalidate : isFallback ? false : 1`), so on
 * a deployment where several instances share one cache:
 * - every read of an entry older than a second is reported stale, which enqueues a revalidation on
 *   nearly every request instead of once per revalidate window,
 * - the entry gets no `cacheControl`, so Next.js emits no `Cache-Control` header for it at all and
 *   the CDN cannot cache the response.
 *
 * We already persist `revalidate` in every cache entry on `set`, and `IncrementalCache#get` awaits
 * the cache handler before it reads the map, so seeding it from a read lands in time to be used for
 * the very same request.
 *
 * We only ever fill a gap, never overwrite: the in memory map takes precedence over the prerender
 * manifest, so writing to a route Next.js already has a cache control for would replace a value
 * that is more authoritative than ours (it comes from the manifest or from an actual render) and
 * would in particular drop the manifest's `expire` - which defaults to a year through the
 * `expireTime` config and is what puts `stale-while-revalidate` in the response.
 *
 * For the routes we do seed we pass `expire: undefined` on purpose. From Next.js 16.3,
 * `IncrementalCache#get` forces a blocking revalidation (`isStale === -1`, surfacing as
 * `x-nextjs-cache: REVALIDATED`) when `lastModified + expire * 1000` is in the past, and it only
 * runs that check for a numeric `expire`. Leaving it undefined keeps {@link getStaleLastModified}
 * working, so a stale entry is still served stale while revalidating in the background. We also
 * have nothing better to offer: cache entries only carry `revalidate`, and guessing an `expire`
 * that turns out to be too short is strictly worse than having none.
 *
 * The map is process wide, but what we write is the route's own TTL - the very value the manifest
 * would have carried had the path been prerendered - so it is route configuration and never per
 * request or per user data. Next.js writes the same map under the same key on every `set`.
 *
 * @param key The key for that specific cache entry, as passed to the cache handler
 * @param revalidate The revalidate value stored alongside the cache entry, in seconds
 */
export function seedCacheControls(
  key: string,
  revalidate?: number | false,
): void {
  // `false` would be turned into a year of CDN caching by Next.js, and `revalidate < 1` makes the
  // pages handler throw (`Invalid revalidate configuration provided: x < 1`), so only a usable
  // numeric TTL is ever seeded. Tag driven invalidation is unaffected: OpenNext expresses it
  // through `lastModified`, not through `revalidate`.
  if (
    typeof revalidate !== "number" ||
    !Number.isFinite(revalidate) ||
    revalidate < 1
  ) {
    return;
  }
  const incrementalCache = (
    globalThis as {
      __incrementalCache?: NextIncrementalCacheInternals;
    }
  ).__incrementalCache;
  if (!incrementalCache) {
    // Not a Next.js version that exposes its incremental cache, or it has not been created yet.
    return;
  }
  const route = toRouteKey(key);
  const seconds = Math.floor(revalidate);
  const { cacheControls, revalidateTimings } = incrementalCache;
  try {
    if (
      typeof cacheControls?.get === "function" &&
      typeof cacheControls.set === "function"
    ) {
      // `get` falls back to the prerender manifest, so this covers both sources at once.
      if (typeof cacheControls.get(route) !== "undefined") {
        return;
      }
      cacheControls.set(route, { revalidate: seconds, expire: undefined });
    } else if (
      typeof revalidateTimings?.get === "function" &&
      typeof revalidateTimings.set === "function"
    ) {
      // Next.js 15.2.0 and below - a bare number instead of a cache control object.
      if (typeof revalidateTimings.get(route) !== "undefined") {
        return;
      }
      revalidateTimings.set(route, seconds);
    }
  } catch (e) {
    // Seeding is an optimisation, a Next.js version we don't recognise should never break a read.
    debug("Failed to seed the cache control", route, e);
  }
}

/**
 * @param key The key for that specific cache entry
 * @param tags Array of tags associated with that cache entry
 * @param cacheEntry The cache entry with its last modified time and value
 * @returns A boolean indicating whether the cache entry has been revalidated -
 * A cache entry is considered revalidated if at least one of its associated tags has been revalidated
 * after the entry's `lastModified` time, meaning the cached data is stale and must be re-fetched.
 * For Next 16+ you need {@link isStale}, to know if a revalidated entry is stale (valid but needs background revalidation) or expired (needs to be re-fetched immediately).
 * Without it, we consider all revalidated entries as expired, which means that they will be re-fetched immediately without a chance to be served stale.
 */
export async function hasBeenRevalidated(
  key: string,
  tags: string[],
  cacheEntry: WithLastModified<CacheValue<any>>,
): Promise<boolean> {
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  const value = cacheEntry.value;
  if (!value) {
    // We should never reach this point
    return true;
  }
  if ("type" in cacheEntry && cacheEntry.type === "page") {
    return false;
  }
  const lastModified = cacheEntry.lastModified ?? Date.now();
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0
      ? false
      : await globalThis.tagCache.hasBeenRevalidated(tags, lastModified);
  }
  // TODO: refactor this, we should introduce a new method in the tagCache interface so that both implementations use hasBeenRevalidated
  const _lastModified = await globalThis.tagCache.getLastModified(
    key,
    lastModified,
  );
  return _lastModified === -1;
}

export function getTagsFromValue(value?: CacheValue<"cache">) {
  if (!value) {
    return [];
  }
  // The try catch is necessary for older version of next.js that may fail on this
  try {
    const cacheTags =
      value.meta?.headers?.["x-next-cache-tags"]?.split(",") ?? [];
    delete value.meta?.headers?.["x-next-cache-tags"];
    return cacheTags;
  } catch (e) {
    return [];
  }
}

function getTagKey(
  tag: string | OriginalTagCacheWriteInput | NextModeTagCacheWriteInput,
): string {
  if (typeof tag === "string") {
    return tag;
  }
  // For OriginalTagCacheWriteInput, include path in the key
  if ("path" in tag) {
    return JSON.stringify({
      tag: tag.tag,
      path: tag.path,
    });
  }
  // For NextModeTagCacheWriteInput, just use the tag
  return tag.tag;
}

export async function writeTags(
  tags: (string | OriginalTagCacheWriteInput | NextModeTagCacheWriteInput)[],
): Promise<void> {
  const store = globalThis.__openNextAls.getStore();
  debug("Writing tags", tags, store);
  if (!store || globalThis.openNextConfig.dangerous?.disableTagCache) {
    return;
  }
  const tagsToWrite = tags.filter((t) => {
    const tagKey = getTagKey(t);
    const shouldWrite = !store.writtenTags.has(tagKey);
    // We preemptively add the tag to the writtenTags set
    // to avoid writing the same tag multiple times in the same request
    if (shouldWrite) {
      store.writtenTags.add(tagKey);
    }
    return shouldWrite;
  });
  if (tagsToWrite.length === 0) {
    return;
  }

  // Here we know that we have the correct type
  await globalThis.tagCache.writeTags(tagsToWrite as any);
}
