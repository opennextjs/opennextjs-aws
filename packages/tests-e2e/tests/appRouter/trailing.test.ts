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

test("trailingSlash redirect to external domain", async ({ page, baseURL }) => {
  const response = await page.goto(`${baseURL}//sst.dev/`);
  expect(response?.status()).toBe(404);
});
