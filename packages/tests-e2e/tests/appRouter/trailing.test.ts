import { expect, test } from "@playwright/test";

test("trailingSlash redirect", async ({ page }) => {
  const response = await page.goto("/ssr/");

  expect(response?.request().redirectedFrom()?.url()).toMatch(/\/ssr\/$/);
  expect(response?.request().url()).toMatch(/\/ssr$/);
});

test("trailingSlash redirect with search parameters", async ({ page }) => {
  const response = await page.goto("/ssr/?happy=true");

  expect(response?.request().redirectedFrom()?.url()).toMatch(
    /\/ssr\/\?happy=true$/,
  );
  expect(response?.request().url()).toMatch(/\/ssr\?happy=true$/);
});
