import { expect, test } from "@playwright/test";

test("trailingSlash redirect", async ({ page }) => {
  const response = await page.goto("/ssr");

  expect(response?.request().redirectedFrom()?.url()).toMatch(/\/ssr$/);
  expect(response?.request().url()).toMatch(/\/ssr\/$/);
});

test("trailingSlash redirect with search parameters", async ({ page }) => {
  const response = await page.goto("/ssr?happy=true");

  expect(response?.request().redirectedFrom()?.url()).toMatch(
    /\/ssr\?happy=true$/,
  );
  expect(response?.request().url()).toMatch(/\/ssr\/\?happy=true$/);
});

test("trailingSlash redirect on an API route", async ({ request }) => {
  const response = await request.get("/api/hello", { maxRedirects: 0 });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(/\/api\/hello\/$/);
});
