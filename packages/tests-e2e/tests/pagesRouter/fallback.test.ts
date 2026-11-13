import { expect, test } from "@playwright/test";

test.describe("fallback", () => {
  test("should work with fully static fallback", async ({ page }) => {
    await page.goto("/fallback-intercepted/static/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Static Fallback Page");
    const p = page.getByTestId("message");
    await expect(p).toHaveText("This is a fully static page.");
  });

  test("should work with static fallback", async ({ page }) => {
    await page.goto("/fallback-intercepted/ssg/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Static Fallback Page");
    const p = page.getByTestId("message");
    await expect(p).toHaveText("This is a static ssg page.");
  });

  test("should work with fallback intercepted by dynamic route", async ({
    page,
  }) => {
    const response = await page.goto("/fallback-intercepted/something/");
    expect(response?.status()).toBe(200);
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Dynamic Fallback Page");
    const p = page.getByTestId("message");
    await expect(p).toHaveText("This is a dynamic fallback page.");
    await expect(page.getByTestId("slugs")).toHaveText('["something"]');
    await expect(page.getByTestId("locale")).toHaveText("en");
  });

  // The locale is intentionally not asserted after a fallthrough.
  //
  // Native Next.js (`next start`, verified on 15.5.27, 16.3.8 and 16.4.0) renders the
  // fallthrough page with the default locale: `/nl/fallback-intercepted/multi/a` gets `en`.
  // The first attempt strips the locale from `req.url` (base-server.ts) and the router
  // server retries the next route with that stripped URL after a `NoFallbackError`.
  // OpenNext has always kept the request locale (`nl`) on every version.
  //
  // Next.js doesn't assert the locale after a fallthrough either: the only test with a
  // non-default locale fallthrough (test/production/app-dir/route-scoped-cache,
  // `/fr/closed/%73ibling/...`) only checks the status and the rendered route.
  //
  // These cases compare route selection and params; the direct-match case checks locale.
  for (const { locale, prefix } of [
    { locale: "en", prefix: "" },
    { locale: "nl", prefix: "/nl" },
  ]) {
    for (const { name, path, slugs } of [
      { name: "spaces", path: "a%20b", slugs: ["multi", "a b"] },
      { name: "encoded slashes", path: "a%2Fb", slugs: ["multi", "a/b"] },
      {
        name: "literal percent sequences",
        path: "a%252Fb",
        slugs: ["multi", "a%2Fb"],
      },
      { name: "multiple segments", path: "a/b", slugs: ["multi", "a", "b"] },
    ]) {
      test(`falls through excluded routes with ${name} (${locale})`, async ({
        page,
      }) => {
        const response = await page.goto(
          `${prefix}/fallback-intercepted/multi/${path}/`,
        );

        expect(response?.status()).toBe(200);
        await expect(page.locator("h1")).toHaveText("Dynamic Fallback Page");
        await expect(page.getByTestId("slugs")).toHaveText(
          JSON.stringify(slugs),
        );
      });
    }
  }

  test("uses the nondefault locale for a directly matched catch-all", async ({
    page,
  }) => {
    const response = await page.goto("/nl/fallback-intercepted/direct/path/");

    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Dynamic Fallback Page");
    await expect(page.getByTestId("slugs")).toHaveText('["direct","path"]');
    await expect(page.getByTestId("locale")).toHaveText("nl");
  });

  test("should work with fallback page pregenerated", async ({ page }) => {
    await page.goto("/fallback-intercepted/fallback/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Static Fallback Page");
    const p = page.getByTestId("message");
    await expect(p).toHaveText("This is a static fallback page.");
  });

  test("should 404 on page not pregenerated", async ({ request }) => {
    const res = await request.get("/fallback/not-generated");
    expect(res.status()).toBe(404);
  });

  // Next.js (verified on 15.5.29 and 16.4.5) keys the prerender manifest with decoded paths,
  // keeping the path delimiters encoded (i.e. the slug `a/b` is keyed `a%2Fb`).
  for (const { name, path, slug } of [
    { name: "an encoded space", path: "with%20space", slug: "with space" },
    {
      name: "an encoded non-ASCII character",
      path: "Pr%C3%A9sentation",
      slug: "Présentation",
    },
    {
      name: "an encoded ASCII character",
      path: "fall%62ack",
      slug: "fallback",
    },
    { name: "an encoded slash", path: "a%2Fb", slug: "a/b" },
    { name: "a lowercase encoded slash", path: "a%2fb", slug: "a/b" },
  ]) {
    test(`should serve pregenerated page with ${name}`, async ({ page }) => {
      const response = await page.goto(`/fallback/${path}/`);

      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveText("Static Fallback Page");
      await expect(page.getByTestId("slug")).toHaveText(slug);

      const buildId = await page.evaluate(
        () =>
          (window as unknown as { __NEXT_DATA__: { buildId: string } })
            .__NEXT_DATA__.buildId,
      );
      const dataResponse = await page.request.get(
        `/_next/data/${buildId}/en/fallback/${path}.json`,
      );
      expect(dataResponse.status()).toBe(200);
      expect(await dataResponse.json()).toEqual({
        pageProps: { message: "This is a static fallback page.", slug },
        __N_SSG: true,
      });
    });
  }

  for (const { name, path } of [
    { name: "a decoded slash", path: "/fallback/a/b/" },
    { name: "a double encoded space", path: "/fallback/with%2520space/" },
    {
      name: "a non-normalized unicode character",
      path: "/fallback/Pre%CC%81sentation/",
    },
    {
      name: "an encoded space on a non-pregenerated locale",
      path: "/nl/fallback/with%20space/",
    },
  ]) {
    test(`should 404 on page not pregenerated with ${name}`, async ({
      request,
    }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(404);
    });
  }
});
