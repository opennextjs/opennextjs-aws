import { expect, test } from "@playwright/test";

// `getStaticPaths` returns `paths: []` with `fallback: "blocking"`, so the page is rendered on
// demand and is not listed in the prerender manifest. This covers that path being rendered, cached
// and then served from the cache.
//
// It deliberately does not assert the cold instance behaviour this configuration is prone to, where
// the process serving the entry is not the one that rendered it: a single server process always has
// its own in memory cache controls warm afterwards, because `IncrementalCache#set` populates them.
// That case is covered by the unit tests driving Next.js' `IncrementalCache` directly.
test("on demand ISR page is rendered, then served from the cache", async ({
  request,
}) => {
  // A path that has never been rendered before, so the first request has to render it.
  const path = `/isr-on-demand/${Date.now()}/`;
  const readTime = (html: string) =>
    html.match(/data-testid="time">([^<]+)</)?.[1];

  const first = await request.get(path);
  expect(first.status()).toEqual(200);
  const renderedTime = readTime(await first.text());
  expect(renderedTime).toBeDefined();

  const second = await request.get(path);
  expect(second.status()).toEqual(200);
  // Still inside the revalidate window, so the entry is served as it was cached rather than rendered
  // a second time.
  expect(readTime(await second.text())).toEqual(renderedTime);
  expect(second.headers()["cache-control"]).toContain("s-maxage");
});
