import { expect, test } from "@playwright/test";

// This app runs with `dangerous.enableCacheInterception` and
// `experimental.prefetchInlining: false`, so Next outlines every segment instead of
// bundling the small ones into their parent. That emits segment kinds the inlined
// default never produces - `/_head`, `/_index` and one per layout - and each has to be
// served from the cache entry rather than replaced by the full page payload.
// appPagesRouter covers the same contract on the inlined (default) layout.
// See https://github.com/opennextjs/opennextjs-aws/issues/1212
test.describe("Segment prefetch with prefetchInlining disabled", () => {
  const prefetchHeaders = { rsc: "1", "next-router-prefetch": "1" };

  // Every segment `next build` outlines for /albums, except `/_full` which is by
  // definition the whole page payload and is asserted separately below.
  const segments = [
    "/_tree",
    "/_index",
    "/_head",
    "/albums",
    "/albums/__PAGE__",
    "/albums/@modal/__DEFAULT__",
  ];

  const prefetch = (request: any, segment?: string) =>
    request.get("/albums", {
      headers: segment
        ? { ...prefetchHeaders, "next-router-segment-prefetch": segment }
        : prefetchHeaders,
    });

  test("every outlined segment is served as itself", async ({ request }) => {
    const full = await prefetch(request);
    expect(full.status()).toEqual(200);
    expect(full.headers()["x-nextjs-postponed"]).toBeUndefined();
    const fullBody = await full.body();

    const payloads = new Set<string>();
    for (const segment of segments) {
      const res = await prefetch(request, segment);

      expect(res.status(), segment).toEqual(200);
      expect(res.headers()["x-opennext-cache"], segment).toEqual("HIT");
      expect(res.headers()["x-nextjs-postponed"], segment).toEqual("2");

      // The regression served the full page payload for every one of these.
      const body = await res.body();
      expect(body.equals(fullBody), segment).toBe(false);
      payloads.add(body.toString("base64"));
    }

    // Distinct payloads, not one response handed back over and over.
    expect(payloads.size).toEqual(segments.length);
  });

  test("/_full serves the whole page payload", async ({ request }) => {
    const full = await prefetch(request);
    const res = await prefetch(request, "/_full");

    expect(res.status()).toEqual(200);
    expect(res.headers()["x-nextjs-postponed"]).toEqual("2");
    expect((await res.body()).equals(await full.body())).toBe(true);
  });

  test("unknown segment is not answered with the full page", async ({
    request,
  }) => {
    const res = await prefetch(request, "/does-not-exist");

    // The interceptor holds segments for this route but not this one, so it falls back
    // to the server, which answers the way Next does: an empty 404.
    expect(res.status()).toEqual(404);
    expect((await res.body()).length).toEqual(0);
  });
});
