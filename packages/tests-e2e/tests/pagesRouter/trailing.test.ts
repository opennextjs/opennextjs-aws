import { expect, test } from "@playwright/test";

test("trailingSlash redirect", async ({ page }) => {
  const response = await page.goto("/ssr");

  expect(response?.request().redirectedFrom()?.url()).toMatch(/\/ssr$/);
  expect(response?.request().url()).toMatch(/\/ssr\/$/);
});
