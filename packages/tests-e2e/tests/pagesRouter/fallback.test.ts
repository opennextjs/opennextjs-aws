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
    await page.goto("/fallback-intercepted/something/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Dynamic Fallback Page");
    const p = page.getByTestId("message");
    await expect(p).toHaveText("This is a dynamic fallback page.");
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
