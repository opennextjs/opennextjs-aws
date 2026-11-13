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

/**
 * Tests that a next.config.js `Content-Security-Policy` does not replace the nonce policy the middleware sets on the request.
 */
test("next.config.js headers do not overwrite the request headers", async ({
  page,
  request,
}) => {
  const response = await request.get("/headers/nonce");

  // The next.config.js policy is on the response
  expect(response.headers()["content-security-policy"]).toEqual(
    "frame-ancestors 'none'",
  );

  // Next found the nonce of the middleware policy on the request
  const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(script).toMatch(/\snonce="[^"]+"/);
  }

  await page.goto("/headers/nonce");
  // Middleware response headers are on the request, next.config.js headers are not
  await expect(page.getByTestId("middleware-header")).toHaveText(
    "response-header",
  );
  await expect(page.getByTestId("next-config-header")).toBeEmpty();
});
