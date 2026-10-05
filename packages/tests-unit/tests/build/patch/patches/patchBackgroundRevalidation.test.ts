import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  patchBackgroundRevalidation,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchBackgroundRevalidation.js";
import { describe, it } from "vitest";

const codeToPatch = `if (cachedResponse && !isOnDemandRevalidate) {
                    var _cachedResponse_value;
                    if (((_cachedResponse_value = cachedResponse.value) == null ? void 0 : _cachedResponse_value.kind) === _types.CachedRouteKind.FETCH) {
                        throw new Error(\`invariant: unexpected cachedResponse of kind fetch in response cache\`);
                    }
                    resolve({
                        ...cachedResponse,
                        revalidate: cachedResponse.curRevalidate
                    });
                    resolved = true;
                    if (!cachedResponse.isStale || context.isPrefetch) {
                        // The cached value is still valid, so we don't need
                        // to update it yet.
                        return null;
                    }
                }`;

// Next 16 renamed the local from `cachedResponse` to
// `previousIncrementalCacheEntry` and added the `isStale !== -1` guard.
const codeToPatchNext16 = `if (previousIncrementalCacheEntry && !context.isOnDemandRevalidate && previousIncrementalCacheEntry.isStale !== -1) {
                    resolve(previousIncrementalCacheEntry);
                    resolved = true;
                    if (!previousIncrementalCacheEntry.isStale || context.isPrefetch) {
                        // The cached value is still valid, so we don't need to update it yet.
                        return previousIncrementalCacheEntry;
                    }
                }`;

// Minified copy of the Next 16 code, as found in
// `next/dist/compiled/next-server/*.runtime.prod.js`.
const codeToPatchMinified =
  "if((a=await r.incrementalCache.get(e,{isFallback:r.isFallback}))&&!r.isOnDemandRevalidate&&-1!==a.isStale&&(n(a),i=!0,!a.isStale||r.isPrefetch))return a;let s=await this.revalidate(e,r.incrementalCache,t,a,i);";

describe("patchBackgroundRevalidation", () => {
  it("Should patch code", () => {
    expect(
      patchCode(codeToPatch, rule),
    ).toMatchInlineSnapshot(`"if (cachedResponse && !isOnDemandRevalidate) {
                    var _cachedResponse_value;
                    if (((_cachedResponse_value = cachedResponse.value) == null ? void 0 : _cachedResponse_value.kind) === _types.CachedRouteKind.FETCH) {
                        throw new Error(\`invariant: unexpected cachedResponse of kind fetch in response cache\`);
                    }
                    resolve({
                        ...cachedResponse,
                        revalidate: cachedResponse.curRevalidate
                    });
                    resolved = true;
                    if (true) {
                        // The cached value is still valid, so we don't need
                        // to update it yet.
                        return null;
                    }
                }"`);
  });

  it("Should patch code on Next 16", () => {
    expect(
      patchCode(codeToPatchNext16, rule),
    ).toMatchInlineSnapshot(`"if (previousIncrementalCacheEntry && !context.isOnDemandRevalidate && previousIncrementalCacheEntry.isStale !== -1) {
                    resolve(previousIncrementalCacheEntry);
                    resolved = true;
                    if (true) {
                        // The cached value is still valid, so we don't need to update it yet.
                        return previousIncrementalCacheEntry;
                    }
                }"`);
  });

  it("Should not match the outer `isStale !== -1` guard", () => {
    // The guard must survive: it is what makes Next fall through to a blocking
    // revalidation for entries that are past their `expire`.
    expect(patchCode(codeToPatchNext16, rule)).toContain(
      "previousIncrementalCacheEntry.isStale !== -1",
    );
  });

  it("Should patch the minified code of the compiled runtimes", () => {
    expect(patchCode(codeToPatchMinified, rule)).toMatchInlineSnapshot(
      `"if((a=await r.incrementalCache.get(e,{isFallback:r.isFallback}))&&!r.isOnDemandRevalidate&&-1!==a.isStale&&(n(a),i=!0,true))return a;let s=await this.revalidate(e,r.incrementalCache,t,a,i);"`,
    );
  });

  it("Should accept dollar signs in minified context identifiers", () => {
    const code = codeToPatchMinified.replaceAll("r.", "$.");
    const patch = patchBackgroundRevalidation.patches[0];
    expect(code).toMatch(patch.contentFilter!);
    expect(patchCode(code, rule)).not.toContain("!a.isStale||$.isPrefetch");
  });

  it.each([
    ".next/server/chunks/ssr/[root-of-the-server]__hash._.js",
    ".next/server/chunks/123.js",
    ".next/server/app/isr/page.js",
    ".next/server/pages/isr.js",
  ])("Should target generated server code at %s on both platforms", (file) => {
    const { pathFilter } = patchBackgroundRevalidation.patches[0];
    expect(file).toMatch(pathFilter);
    expect(file.replaceAll("/", "\\")).toMatch(pathFilter);
  });

  it.each([
    // Not the stale check
    "if(a&&!r.isOnDemandRevalidate&&(n(a),i=!0,!a.isStale&&r.isPrefetch))return a;",
    "if(a&&!r.isOnDemandRevalidate&&(n(a),i=!0,a.isStale||r.isPrefetch))return a;",
    "if(a&&!r.isOnDemandRevalidate&&(n(a),i=!0,!a.isStale||r.isPrefetch||r.isFallback))return a;",
    // Not guarded by the on-demand revalidation check
    "if(a&&(n(a),i=!0,!a.isStale||r.isPrefetch))return a;",
    // Guarded by an unrelated context object
    "if(a&&!other.isOnDemandRevalidate&&(n(a),i=!0,!a.isStale||r.isPrefetch))return a;",
    "let t=!a.isStale||r.isPrefetch;if(!r.isOnDemandRevalidate)return t;",
  ])("Should not patch unrelated code: %s", (code) => {
    expect(patchCode(code, rule)).toBe(code);
  });

  it("Should target Next runtimes but not unrelated source/client files", () => {
    const { pathFilter } = patchBackgroundRevalidation.patches[0];
    expect(
      "next/dist/server/response-cache/index.js".match(pathFilter),
    ).toBeTruthy();
    expect(
      "next/dist/compiled/next-server/app-page.runtime.prod.js".match(
        pathFilter,
      ),
    ).toBeTruthy();
    expect(
      "next/dist/compiled/next-server/app-page-turbo.runtime.prod.js".match(
        pathFilter,
      ),
    ).toBeTruthy();
    expect("next/dist/server/next-server.js".match(pathFilter)).toBeFalsy();
    expect("src/app/page.js".match(pathFilter)).toBeFalsy();
    expect(".next/static/chunks/123.js".match(pathFilter)).toBeFalsy();
  });
});
