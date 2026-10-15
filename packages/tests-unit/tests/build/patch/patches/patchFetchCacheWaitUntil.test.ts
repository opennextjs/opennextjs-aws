import { runInNewContext } from "node:vm";

import { describe, expect, test, vi } from "vitest";

import {
  applyRule,
  parseCode,
  patchCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { rule } from "@opennextjs/aws/build/patch/patches/patchFetchCacheWaitUntil.js";
import { computePatchDiff } from "./util.js";

describe("patchFetchCacheSetMissingWaitUntil", () => {
  test("on minified code", () => {
    const code = `
{
  let [o4, a2] = (0, d2.cloneResponse)(e3);
  return o4.arrayBuffer().then(async (e4) => {
    var a3;
    let i4 = Buffer.from(e4), s3 = { headers: Object.fromEntries(o4.headers.entries()), body: i4.toString("base64"), status: o4.status, url: o4.url };
    null == $ || null == (a3 = $.serverComponentsHmrCache) || a3.set(n2, s3), F && await H.set(n2, { kind: c2.CachedRouteKind.FETCH, data: s3, revalidate: t5 }, { fetchCache: true, revalidate: r4, fetchUrl: _, fetchIdx: q, tags: A2 });
  }).catch((e4) => console.warn("Failed to set fetch cache", u4, e4)).finally(X), a2;
}`;

    expect(patchCode(code, rule)).toMatchInlineSnapshot(`
      "{
        let [o4, a2] = (0, d2.cloneResponse)(e3);
        return ((promise) => {
        const store = globalThis.__openNextAls?.getStore();
        if (store?.waitUntil) {
          store.waitUntil(promise);
        } else {
          store?.pendingPromiseRunner.add(promise);
        }
        return promise;
      })(o4.arrayBuffer().then(async (e4) => {
          var a3;
          let i4 = Buffer.from(e4), s3 = { headers: Object.fromEntries(o4.headers.entries()), body: i4.toString("base64"), status: o4.status, url: o4.url };
          null == $ || null == (a3 = $.serverComponentsHmrCache) || a3.set(n2, s3), F && await H.set(n2, { kind: c2.CachedRouteKind.FETCH, data: s3, revalidate: t5 }, { fetchCache: true, revalidate: r4, fetchUrl: _, fetchIdx: q, tags: A2 });
        }).catch((e4) => console.warn("Failed to set fetch cache", u4, e4)).finally(X))
      , a2;
      }"
    `);
  });

  test("on minified code assigning the promise (Next.js 15.4+)", () => {
    // source: next@16.3.8 dist/compiled/next-server/app-route.runtime.prod.js
    const code = `async function rv(e,t,r,n,s,i,a,o,l,c){let[u,d]=rh(t),h=u.arrayBuffer().then(async e=>{let t=Buffer.from(e),o={headers:Object.fromEntries(u.headers.entries()),body:t.toString("base64"),status:u.status,url:u.url};null==i||i.set(r,o),n&&await s.set(r,{kind:ex.FETCH,data:o,revalidate:a},n)}).catch(e=>{(null==c?void 0:c.aborted)||console.warn("Failed to set fetch cache",o,e)}).finally(l),f=\`cache-set-\${r}\`,p=e.pendingRevalidates??={},m=Promise.resolve();return f in p&&(m=p[f]),p[f]=m.then(()=>h).finally(()=>{(null==p?void 0:p[f])&&delete p[f]}),d}`;

    expect(patchCode(code, rule)).toMatchInlineSnapshot(`
      "async function rv(e,t,r,n,s,i,a,o,l,c){let[u,d]=rh(t),h=((promise) => {
        const store = globalThis.__openNextAls?.getStore();
        if (store?.waitUntil) {
          store.waitUntil(promise);
        } else {
          store?.pendingPromiseRunner.add(promise);
        }
        return promise;
      })(u.arrayBuffer().then(async e=>{let t=Buffer.from(e),o={headers:Object.fromEntries(u.headers.entries()),body:t.toString("base64"),status:u.status,url:u.url};null==i||i.set(r,o),n&&await s.set(r,{kind:ex.FETCH,data:o,revalidate:a},n)}).catch(e=>{(null==c?void 0:c.aborted)||console.warn("Failed to set fetch cache",o,e)}).finally(l))
      ,f=\`cache-set-\${r}\`,p=e.pendingRevalidates??={},m=Promise.resolve();return f in p&&(m=p[f]),p[f]=m.then(()=>h).finally(()=>{(null==p?void 0:p[f])&&delete p[f]}),d}"
    `);
  });

  test("only matches the write when the fetch implementation is assigned too (Next.js 15.0 - 15.4)", () => {
    // Up to Next 15.4 the whole fetch implementation (`getTracer().trace(...)`) is assigned to a
    // variable and contains the write. It must not be matched instead of the write.
    const code = `let g=(0,a.getTracer)().trace(x,{},async()=>{let[u,d]=rh(t),h=u.arrayBuffer().then(async e=>{let t=Buffer.from(e);await s.set(r,{kind:ex.FETCH,data:t})}).catch(e=>console.warn("Failed to set fetch cache",e)).finally(l);return d});`;

    const { matches } = applyRule(rule, parseCode(code));

    expect(matches).toHaveLength(1);
    expect(matches[0].text()).toMatch(/^u\.arrayBuffer\(\)\.then/);
  });

  describe("at runtime", () => {
    // The promise is assigned and awaited by Next 15.4+, the fix must evaluate to it.
    const code = `
      const cacheSetPromise = cloned1.arrayBuffer().then(async (arrayBuffer) => {
        const data = Buffer.from(arrayBuffer).toString("base64");
        await incrementalCache.set(cacheKey, { kind: CachedRouteKind.FETCH, data });
      });
      result = cacheSetPromise;
    `;

    function run(store: object | undefined) {
      const context = {
        Buffer,
        cloned1: { arrayBuffer: async () => new ArrayBuffer(0) },
        incrementalCache: { set: vi.fn(async () => {}) },
        cacheKey: "key",
        CachedRouteKind: { FETCH: "FETCH" },
        result: undefined as Promise<void> | undefined,
        // Globals of the context, read by the fix via \`globalThis.__openNextAls\`.
        __openNextAls: { getStore: () => store },
      };
      runInNewContext(patchCode(code, rule), context);
      return context;
    }

    test("registers the write with the runtime waitUntil and returns it", async () => {
      const store = {
        waitUntil: vi.fn(),
        pendingPromiseRunner: { add: vi.fn() },
      };

      const context = run(store);

      expect(context.result).toBeInstanceOf(Promise);
      expect(store.waitUntil).toHaveBeenCalledWith(context.result);
      expect(store.pendingPromiseRunner.add).not.toHaveBeenCalled();
      await context.result;
      expect(context.incrementalCache.set).toHaveBeenCalledTimes(1);
    });

    test("falls back to the pending promise runner without a runtime waitUntil", async () => {
      const store = { pendingPromiseRunner: { add: vi.fn() } };

      const context = run(store);

      expect(store.pendingPromiseRunner.add).toHaveBeenCalledWith(
        context.result,
      );
      await context.result;
      expect(context.incrementalCache.set).toHaveBeenCalledTimes(1);
    });

    test("keeps the promise outside of a request context", async () => {
      const context = run(undefined);

      await context.result;
      expect(context.incrementalCache.set).toHaveBeenCalledTimes(1);
    });
  });

  describe("on non-minified code", () => {
    test("Next.js 15.4.0", () => {
      // source: next@15.4.0 dist/server/lib/patch-fetch.js
      const code = `const [cloned1, cloned2] = (0, _cloneresponse.cloneResponse)(res);
// We are dynamically rendering including dev mode. We want to return
// the response to the caller as soon as possible because it might stream
// over a very long time.
const cacheSetPromise = cloned1.arrayBuffer().then(async (arrayBuffer)=>{
    var _useCacheOrRequestStore_serverComponentsHmrCache;
    const bodyBuffer = Buffer.from(arrayBuffer);
    const fetchedData = {
        headers: Object.fromEntries(cloned1.headers.entries()),
        body: bodyBuffer.toString('base64'),
        status: cloned1.status,
        url: cloned1.url
    };
    useCacheOrRequestStore == null ? void 0 : (_useCacheOrRequestStore_serverComponentsHmrCache = useCacheOrRequestStore.serverComponentsHmrCache) == null ? void 0 : _useCacheOrRequestStore_serverComponentsHmrCache.set(cacheKey, fetchedData);
    if (isCacheableRevalidate) {
        await incrementalCache.set(cacheKey, {
            kind: _responsecache.CachedRouteKind.FETCH,
            data: fetchedData,
            revalidate: normalizedRevalidate
        }, {
            fetchCache: true,
            fetchUrl,
            fetchIdx,
            tags
        });
    }
}).catch((error)=>console.warn(\`Failed to set fetch cache\`, input, error)).finally(handleUnlock);
const pendingRevalidateKey = \`cache-set-\${cacheKey}\`;
workStore.pendingRevalidates ??= {};
workStore.pendingRevalidates[pendingRevalidateKey] = cacheSetPromise.finally(()=>{
    delete workStore.pendingRevalidates[pendingRevalidateKey];
});
return cloned2;`;

      expect(
        computePatchDiff("patch-fetch.js", code, rule),
      ).toMatchInlineSnapshot(`
        "Index: patch-fetch.js
        ===================================================================
        --- patch-fetch.js
        +++ patch-fetch.js
        @@ -1,9 +1,17 @@
         const [cloned1, cloned2] = (0, _cloneresponse.cloneResponse)(res);
         // We are dynamically rendering including dev mode. We want to return
         // the response to the caller as soon as possible because it might stream
         // over a very long time.
        -const cacheSetPromise = cloned1.arrayBuffer().then(async (arrayBuffer)=>{
        +const cacheSetPromise = ((promise) => {
        +  const store = globalThis.__openNextAls?.getStore();
        +  if (store?.waitUntil) {
        +    store.waitUntil(promise);
        +  } else {
        +    store?.pendingPromiseRunner.add(promise);
        +  }
        +  return promise;
        +})(cloned1.arrayBuffer().then(async (arrayBuffer)=>{
             var _useCacheOrRequestStore_serverComponentsHmrCache;
             const bodyBuffer = Buffer.from(arrayBuffer);
             const fetchedData = {
                 headers: Object.fromEntries(cloned1.headers.entries()),
        @@ -23,9 +31,10 @@
                     fetchIdx,
                     tags
                 });
             }
        -}).catch((error)=>console.warn(\`Failed to set fetch cache\`, input, error)).finally(handleUnlock);
        +}).catch((error)=>console.warn(\`Failed to set fetch cache\`, input, error)).finally(handleUnlock))
        +;
         const pendingRevalidateKey = \`cache-set-\${cacheKey}\`;
         workStore.pendingRevalidates ??= {};
         workStore.pendingRevalidates[pendingRevalidateKey] = cacheSetPromise.finally(()=>{
             delete workStore.pendingRevalidates[pendingRevalidateKey];
        "
      `);
    });

    test("15.1.0", () => {
      // source: https://github.com/vercel/next.js/blob/fe45b74fdac83d3/packages/next/src/server/lib/patch-fetch.ts#L627-L732
      const code = `if (
                res.status === 200 &&
                incrementalCache &&
                cacheKey &&
                (isCacheableRevalidate ||
                  useCacheOrRequestStore?.serverComponentsHmrCache)
              ) {
                const normalizedRevalidate =
                  finalRevalidate >= INFINITE_CACHE
                    ? CACHE_ONE_YEAR
                    : finalRevalidate
                const externalRevalidate =
                  finalRevalidate >= INFINITE_CACHE ? false : finalRevalidate

                if (workUnitStore && workUnitStore.type === 'prerender') {
                  // We are prerendering at build time or revalidate time with dynamicIO so we need to
                  // buffer the response so we can guarantee it can be read in a microtask
                  const bodyBuffer = await res.arrayBuffer()

                  const fetchedData = {
                    headers: Object.fromEntries(res.headers.entries()),
                    body: Buffer.from(bodyBuffer).toString('base64'),
                    status: res.status,
                    url: res.url,
                  }

                  // We can skip checking the serverComponentsHmrCache because we aren't in
                  // dev mode.

                  await incrementalCache.set(
                    cacheKey,
                    {
                      kind: CachedRouteKind.FETCH,
                      data: fetchedData,
                      revalidate: normalizedRevalidate,
                    },
                    {
                      fetchCache: true,
                      revalidate: externalRevalidate,
                      fetchUrl,
                      fetchIdx,
                      tags,
                    }
                  )
                  await handleUnlock()

                  // We return a new Response to the caller.
                  return new Response(bodyBuffer, {
                    headers: res.headers,
                    status: res.status,
                    statusText: res.statusText,
                  })
                } else {
                  // We're cloning the response using this utility because there
                  // exists a bug in the undici library around response cloning.
                  // See the following pull request for more details:
                  // https://github.com/vercel/next.js/pull/73274

                  const [cloned1, cloned2] = cloneResponse(res)

                  // We are dynamically rendering including dev mode. We want to return
                  // the response to the caller as soon as possible because it might stream
                  // over a very long time.
                  cloned1
                    .arrayBuffer()
                    .then(async (arrayBuffer) => {
                      const bodyBuffer = Buffer.from(arrayBuffer)

                      const fetchedData = {
                        headers: Object.fromEntries(cloned1.headers.entries()),
                        body: bodyBuffer.toString('base64'),
                        status: cloned1.status,
                        url: cloned1.url,
                      }

                      useCacheOrRequestStore?.serverComponentsHmrCache?.set(
                        cacheKey,
                        fetchedData
                      )

                      if (isCacheableRevalidate) {
                        await incrementalCache.set(
                          cacheKey,
                          {
                            kind: CachedRouteKind.FETCH,
                            data: fetchedData,
                            revalidate: normalizedRevalidate,
                          },
                          {
                            fetchCache: true,
                            revalidate: externalRevalidate,
                            fetchUrl,
                            fetchIdx,
                            tags,
                          }
                        )
                      }
                    })
                    .catch((error) =>
                      console.warn(\`Failed to set fetch cache\`, input, error)
                    )
                    .finally(handleUnlock)

                  return cloned2
                }
              }
      `;

      expect(
        computePatchDiff("patch-fetch.js", code, rule),
      ).toMatchInlineSnapshot(`
        "Index: patch-fetch.js
        ===================================================================
        --- patch-fetch.js
        +++ patch-fetch.js
        @@ -60,9 +60,17 @@
         
                           // We are dynamically rendering including dev mode. We want to return
                           // the response to the caller as soon as possible because it might stream
                           // over a very long time.
        -                  cloned1
        +                  ((promise) => {
        +  const store = globalThis.__openNextAls?.getStore();
        +  if (store?.waitUntil) {
        +    store.waitUntil(promise);
        +  } else {
        +    store?.pendingPromiseRunner.add(promise);
        +  }
        +  return promise;
        +})(cloned1
                             .arrayBuffer()
                             .then(async (arrayBuffer) => {
                               const bodyBuffer = Buffer.from(arrayBuffer)
         
        @@ -98,10 +106,11 @@
                             })
                             .catch((error) =>
                               console.warn(\`Failed to set fetch cache\`, input, error)
                             )
        -                    .finally(handleUnlock)
        +                    .finally(handleUnlock))
         
        +
                           return cloned2
                         }
                       }
               
        \\ No newline at end of file
        "
      `);
    });

    test("Next.js 15.0.4", () => {
      // source: https://github.com/vercel/next.js/blob/d6a6aa14069/packages/next/src/server/lib/patch-fetch.ts#L627-L725
      const code = `if (
      res.status === 200 &&
      incrementalCache &&
      cacheKey &&
      (isCacheableRevalidate || requestStore?.serverComponentsHmrCache)
    ) {
      const normalizedRevalidate =
        finalRevalidate >= INFINITE_CACHE
          ? CACHE_ONE_YEAR
          : finalRevalidate
      const externalRevalidate =
        finalRevalidate >= INFINITE_CACHE ? false : finalRevalidate

      if (workUnitStore && workUnitStore.type === 'prerender') {
        // We are prerendering at build time or revalidate time with dynamicIO so we need to
        // buffer the response so we can guarantee it can be read in a microtask
        const bodyBuffer = await res.arrayBuffer()

        const fetchedData = {
          headers: Object.fromEntries(res.headers.entries()),
          body: Buffer.from(bodyBuffer).toString('base64'),
          status: res.status,
          url: res.url,
        }

        // We can skip checking the serverComponentsHmrCache because we aren't in
        // dev mode.

        await incrementalCache.set(
          cacheKey,
          {
            kind: CachedRouteKind.FETCH,
            data: fetchedData,
            revalidate: normalizedRevalidate,
          },
          {
            fetchCache: true,
            revalidate: externalRevalidate,
            fetchUrl,
            fetchIdx,
            tags,
          }
        )
        await handleUnlock()

        // We we return a new Response to the caller.
        return new Response(bodyBuffer, {
          headers: res.headers,
          status: res.status,
          statusText: res.statusText,
        })
      } else {
        // We are dynamically rendering including dev mode. We want to return
        // the response to the caller as soon as possible because it might stream
        // over a very long time.
        res
          .clone()
          .arrayBuffer()
          .then(async (arrayBuffer) => {
            const bodyBuffer = Buffer.from(arrayBuffer)

            const fetchedData = {
              headers: Object.fromEntries(res.headers.entries()),
              body: bodyBuffer.toString('base64'),
              status: res.status,
              url: res.url,
            }

            requestStore?.serverComponentsHmrCache?.set(
              cacheKey,
              fetchedData
            )

            if (isCacheableRevalidate) {
              await incrementalCache.set(
                cacheKey,
                {
                  kind: CachedRouteKind.FETCH,
                  data: fetchedData,
                  revalidate: normalizedRevalidate,
                },
                {
                  fetchCache: true,
                  revalidate: externalRevalidate,
                  fetchUrl,
                  fetchIdx,
                  tags,
                }
              )
            }
          })
          .catch((error) =>
            console.warn(\`Failed to set fetch cache\`, input, error)
          )
          .finally(handleUnlock)

        return res
      }
    }`;

      expect(
        computePatchDiff("patch-fetch.js", code, rule),
      ).toMatchInlineSnapshot(`
        "Index: patch-fetch.js
        ===================================================================
        --- patch-fetch.js
        +++ patch-fetch.js
        @@ -52,9 +52,17 @@
               } else {
                 // We are dynamically rendering including dev mode. We want to return
                 // the response to the caller as soon as possible because it might stream
                 // over a very long time.
        -        res
        +        ((promise) => {
        +  const store = globalThis.__openNextAls?.getStore();
        +  if (store?.waitUntil) {
        +    store.waitUntil(promise);
        +  } else {
        +    store?.pendingPromiseRunner.add(promise);
        +  }
        +  return promise;
        +})(res
                   .clone()
                   .arrayBuffer()
                   .then(async (arrayBuffer) => {
                     const bodyBuffer = Buffer.from(arrayBuffer)
        @@ -91,9 +99,10 @@
                   })
                   .catch((error) =>
                     console.warn(\`Failed to set fetch cache\`, input, error)
                   )
        -          .finally(handleUnlock)
        +          .finally(handleUnlock))
         
        +
                 return res
               }
             }
        \\ No newline at end of file
        "
      `);
    });
  });
});
