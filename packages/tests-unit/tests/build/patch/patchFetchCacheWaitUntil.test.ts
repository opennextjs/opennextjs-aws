import { describe, expect, test } from "vitest";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { rule } from "@opennextjs/aws/build/patch/patchFetchCacheWaitUntil.js";

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
        return globalThis.__openNextAls?.getStore()?.pendingPromiseRunner.add(o4.arrayBuffer().then(async (e4) => {
          var a3;
          let i4 = Buffer.from(e4), s3 = { headers: Object.fromEntries(o4.headers.entries()), body: i4.toString("base64"), status: o4.status, url: o4.url };
          null == $ || null == (a3 = $.serverComponentsHmrCache) || a3.set(n2, s3), F && await H.set(n2, { kind: c2.CachedRouteKind.FETCH, data: s3, revalidate: t5 }, { fetchCache: true, revalidate: r4, fetchUrl: _, fetchIdx: q, tags: A2 });
        }).catch((e4) => console.warn("Failed to set fetch cache", u4, e4)).finally(X))
      , a2;
      }"
    `);
  });

  describe("on non-minified code", () => {
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

      expect(patchCode(code, rule)).toMatchInlineSnapshot(`
        "if (
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
                          globalThis.__openNextAls?.getStore()?.pendingPromiseRunner.add(cloned1
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
                            .finally(handleUnlock))


                          return cloned2
                        }
                      }
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

      expect(patchCode(code, rule)).toMatchInlineSnapshot(`
        "if (
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
                globalThis.__openNextAls?.getStore()?.pendingPromiseRunner.add(res
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
                  .finally(handleUnlock))


                return res
              }
            }"
      `);
    });
  });
});
