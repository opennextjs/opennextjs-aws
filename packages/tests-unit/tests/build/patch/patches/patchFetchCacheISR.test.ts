import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  fetchRule,
  unstable_cacheRule,
} from "@opennextjs/aws/build/patch/patches/patchFetchCacheISR.js";
import { describe } from "vitest";

const unstable_cacheCode = `
if (// when we are nested inside of other unstable_cache's
                // we should bypass cache similar to fetches
                !isNestedUnstableCache && workStore.fetchCache !== 'force-no-store' && !workStore.isOnDemandRevalidate && !incrementalCache.isOnDemandRevalidate && !workStore.isDraftMode) {
                    // We attempt to get the current cache entry from the incremental cache.
                    const cacheEntry = await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: options.revalidate,
                        tags,
                        softTags: implicitTags,
                        fetchIdx,
                        fetchUrl
                    });
}
else {
                noStoreFetchIdx += 1;
                // We are in Pages Router or were called outside of a render. We don't have a store
                // so we just call the callback directly when it needs to run.
                // If the entry is fresh we return it. If the entry is stale we return it but revalidate the entry in
                // the background. If the entry is missing or invalid we generate a new entry and return it.
                if (!incrementalCache.isOnDemandRevalidate) {
                    // We aren't doing an on demand revalidation so we check use the cache if valid
                    const implicitTags = !workUnitStore || workUnitStore.type === 'unstable-cache' ? [] : workUnitStore.implicitTags;
                    const cacheEntry = await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: options.revalidate,
                        tags,
                        fetchIdx,
                        fetchUrl,
                        softTags: implicitTags
                    });
}
`;

const patchFetchCacheCodeUnMinified = `
const entry = workStore.isOnDemandRevalidate ? null : await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: finalRevalidate,
                        fetchUrl,
                        fetchIdx,
                        tags,
                        softTags: implicitTags
                    });
`;

const patchFetchCacheCodeMinifiedNext15 = `
let t=P.isOnDemandRevalidate?null:await V.get(n,{kind:l.IncrementalCacheKind.FETCH,revalidate:_,fetchUrl:y,fetchIdx:X,tags:N,softTags:C});
`;

describe("patchUnstableCacheForISR", () => {
  test("on unminified code", async () => {
    expect(
      patchCode(unstable_cacheCode, unstable_cacheRule),
    ).toMatchInlineSnapshot(`
"if (// when we are nested inside of other unstable_cache's
                // we should bypass cache similar to fetches
                !isNestedUnstableCache && workStore.fetchCache !== 'force-no-store' && !(workStore.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation) && !(incrementalCache.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation) && !workStore.isDraftMode) {
                    // We attempt to get the current cache entry from the incremental cache.
                    const cacheEntry = await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: options.revalidate,
                        tags,
                        softTags: implicitTags,
                        fetchIdx,
                        fetchUrl
                    });
}
else {
                noStoreFetchIdx += 1;
                // We are in Pages Router or were called outside of a render. We don't have a store
                // so we just call the callback directly when it needs to run.
                // If the entry is fresh we return it. If the entry is stale we return it but revalidate the entry in
                // the background. If the entry is missing or invalid we generate a new entry and return it.
                if (!(incrementalCache.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation)) {
                    // We aren't doing an on demand revalidation so we check use the cache if valid
                    const implicitTags = !workUnitStore || workUnitStore.type === 'unstable-cache' ? [] : workUnitStore.implicitTags;
                    const cacheEntry = await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: options.revalidate,
                        tags,
                        fetchIdx,
                        fetchUrl,
                        softTags: implicitTags
                    });
}
"
`);
  });
});

describe("patchFetchCacheISR", () => {
  describe("Next 15", () => {
    test("on unminified code", async () => {
      expect(
        patchCode(patchFetchCacheCodeUnMinified, fetchRule),
      ).toMatchInlineSnapshot(`
"const entry = (workStore.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation) ? null : await incrementalCache.get(cacheKey, {
                        kind: _responsecache.IncrementalCacheKind.FETCH,
                        revalidate: finalRevalidate,
                        fetchUrl,
                        fetchIdx,
                        tags,
                        softTags: implicitTags
                    });
"
  `);
    });

    test("on minified code", async () => {
      expect(
        patchCode(patchFetchCacheCodeMinifiedNext15, fetchRule),
      ).toMatchInlineSnapshot(`
"let t=(P.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation)?null:await V.get(n,{kind:l.IncrementalCacheKind.FETCH,revalidate:_,fetchUrl:y,fetchIdx:X,tags:N,softTags:C});
"
`);
    });
  });
  //TODO: Add test for Next 14.2.24
});
