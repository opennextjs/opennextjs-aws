import { expect, test } from "@playwright/test";

test("skipTrailingSlashRedirect redirect", async ({ page }) => {
  const response = await page.goto("/ssr");

  expect(response?.request().redirectedFrom()).toBeNull();
  expect(response?.request().url()).toMatch(/\/ssr$/);
});
