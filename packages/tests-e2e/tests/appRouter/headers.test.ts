import { expect, test } from "@playwright/test";

/**
 * Tests that the headers are available in RSC and response headers
 */
test("Headers", async ({ page }) => {
  const responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/headers");

  const response = await responsePromise;
  // Response header should be set
  const headers = response.headers();
  expect(headers["response-header"]).toEqual("response-header");

  // The next.config.js headers should be also set in response
  expect(headers["e2e-headers"]).toEqual("next.config.js");

  // Request header should be available in RSC
  const el = page.getByText("request-header");
  await expect(el).toBeVisible();

  // Both these headers should not be present cause poweredByHeader is false in appRouter
  expect(headers["x-powered-by"]).toBeFalsy();
  expect(headers["x-opennext"]).toBeFalsy();

  // Request ID header should be set
  expect(headers["x-opennext-requestid"]).not.toBeFalsy();
});

/**
 * Tests that the middleware headers are applied after next.config.js headers. Requires 'dangerous.middlewareHeadersOverrideNextConfigHeaders' to be set.
 */
test("Middleware headers override next.config.js headers", async ({ page }) => {
  const responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/headers/override-from-middleware");

  const response = await responsePromise;
  // Response header should be set
  const headers = response.headers();

  // The next.config.js headers is overwritten by the middleware
  expect(headers["e2e-headers"]).toEqual("middleware");
});
