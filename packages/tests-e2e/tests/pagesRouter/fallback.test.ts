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

  // Native Next.js 16.4 resets nl to en after fallthrough in this fixture; OpenNext retains nl.
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
});
