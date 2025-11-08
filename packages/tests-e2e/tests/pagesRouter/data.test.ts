import { expect, test } from "@playwright/test";

test("fix _next/data", async ({ page }) => {
  await page.goto("/");

  const isrJson = page.waitForResponse("/_next/data/*/en/isr.json");
  const response = await isrJson;
  expect(response.ok()).toBe(true);
  expect(response.request().url()).toMatch(/\/_next\/data\/.*\/en\/isr\.json$/);

  await page.locator('[href="/isr/"]').click();
  await page.waitForURL("/isr/");

  const homeJson = page.waitForResponse("/_next/data/*/en.json");
  await page.locator('[href="/"]').click();
  const response2 = await homeJson;
  expect(response2.ok()).toBe(true);
  expect(response2.request().url()).toMatch(/\/_next\/data\/.*\/en\.json$/);
  await page.waitForURL("/");
  const body = await response2.json();
  expect(body).toEqual({
    pageProps: { subpage: [], pageType: "home" },
    __N_SSG: true,
  });
});
