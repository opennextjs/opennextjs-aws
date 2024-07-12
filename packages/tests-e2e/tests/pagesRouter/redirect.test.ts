import { expect, test } from "@playwright/test";

test("Single redirect", async ({ page }) => {
  await page.goto("/next-config-redirect-without-locale-support/");

  await page.waitForURL("https://open-next.js.org/");
  let el = page.getByRole("heading", { name: "Open source Next.js adapter" });
  await expect(el).toBeVisible();
});

test("Redirect with default locale support", async ({ page }) => {
  await page.goto("/redirect-with-locale/");

  await page.waitForURL("/ssr/");
  let el = page.getByText("SSR");
  await expect(el).toBeVisible();
});

test("Redirect with locale support", async ({ page }) => {
  await page.goto("/nl/redirect-with-locale/");

  await page.waitForURL("/nl/ssr/");
  let el = page.getByText("SSR");
  await expect(el).toBeVisible();
});
