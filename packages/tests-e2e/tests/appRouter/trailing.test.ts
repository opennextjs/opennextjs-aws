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

test("trailingSlash redirect for API routes", async ({ request }) => {
  const response = await request.get("/api/protected/", { maxRedirects: 0 });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(
    /^(https?:\/\/[^/]+)?\/api\/protected$/,
  );
});

test("trailingSlash can not bypass the proxy on API routes", async ({
  request,
}) => {
  const response = await request.get("/api/protected/");

  expect(response.status()).toBe(401);
  expect(await response.text()).not.toContain("top-secret");
});

test("trailingSlash redirect to external domain", async ({ page, baseURL }) => {
  const response = await page.goto(`${baseURL}//sst.dev/`);
  expect(response?.status()).toBe(404);
});
