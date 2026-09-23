import { expect, test } from "@playwright/test";

// This app runs with `dangerous.enableCacheInterception`, so these requests are answered
// by the cache interceptor rather than by NextServer - `x-opennext-cache` asserts that.
//
// A request from the client Segment Cache has to be answered with the segment it asked
// for. Answering with the full page payload is not a different-but-valid response: the
// router never records the prefetch as satisfied and re-requests it forever.
// See https://github.com/opennextjs/opennextjs-aws/issues/1212
test.describe("Segment prefetch", () => {
  const prefetchHeaders = { rsc: "1", "next-router-prefetch": "1" };

  test("full prefetch returns the page payload without a segment marker", async ({
    request,
  }) => {
    const res = await request.get("/albums", { headers: prefetchHeaders });

    expect(res.status()).toEqual(200);
    expect(res.headers()["x-opennext-cache"]).toEqual("HIT");
    expect(res.headers()["content-type"]).toContain("text/x-component");
    // Absent marker is how the router tells "this route has no segment cache" from
    // "segment cache miss", so it must not be set on a full page response.
    expect(res.headers()["x-nextjs-postponed"]).toBeUndefined();
  });

  test("segment prefetch returns that segment, not the full page", async ({
    request,
  }) => {
    const full = await request.get("/albums", { headers: prefetchHeaders });
    const fullBody = await full.body();

    for (const segment of ["/_tree", "/albums/__PAGE__"]) {
      const res = await request.get("/albums", {
        headers: {
          ...prefetchHeaders,
          "next-router-segment-prefetch": segment,
        },
      });

      expect(res.status()).toEqual(200);
      expect(res.headers()["x-opennext-cache"]).toEqual("HIT");
      expect(res.headers()["x-nextjs-postponed"]).toEqual("2");

      // The regression served the full page payload here, byte for byte.
      const body = await res.body();
      expect(body.equals(fullBody)).toBe(false);
      expect(body.length).toBeLessThan(fullBody.length);
    }
  });

  test("each segment prefetch returns a distinct payload", async ({
    request,
  }) => {
    const get = async (segment: string) =>
      (
        await request.get("/albums", {
          headers: {
            ...prefetchHeaders,
            "next-router-segment-prefetch": segment,
          },
        })
      ).body();

    const [tree, page] = await Promise.all([
      get("/_tree"),
      get("/albums/__PAGE__"),
    ]);

    expect(tree.equals(page)).toBe(false);
  });

  test("unknown segment is not answered with the full page", async ({
    request,
  }) => {
    const full = await request.get("/albums", { headers: prefetchHeaders });
    const res = await request.get("/albums", {
      headers: {
        ...prefetchHeaders,
        "next-router-segment-prefetch": "/does-not-exist",
      },
    });

    // The interceptor holds segments for this route but not this one, so it falls back
    // to the server, which answers the way Next does: an empty 404.
    expect(res.status()).toEqual(404);
    expect((await res.body()).length).toEqual(0);
    expect((await full.body()).length).toBeGreaterThan(0);
  });
});
