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

test("trailingSlash redirect for API routes", async ({ request }) => {
  const response = await request.get("/api/hello?happy=true", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(
    /^(https?:\/\/[^/]+)?\/api\/hello\/\?happy=true$/,
  );
});

test("trailingSlash redirect for API routes with __nextDataReq", async ({
  request,
}) => {
  const response = await request.get("/api/hello?__nextDataReq=1", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(
    /^(https?:\/\/[^/]+)?\/api\/hello\/\?__nextDataReq=1$/,
  );
});

test("no trailingSlash redirect for data requests", async ({ request }) => {
  const html = await (await request.get("/ssr/")).text();
  const buildId = /"buildId":"([^"]+)"/.exec(html)?.[1];
  expect(buildId).toBeTruthy();

  const response = await request.get(`/_next/data/${buildId}/ssr.json`, {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/application\/json/);
});
