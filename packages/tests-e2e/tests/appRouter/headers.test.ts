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
  await expect(headers["response-header"]).toEqual("response-header");

  // The next.config.js headers should be also set in response
  await expect(headers["e2e-headers"]).toEqual("next.config.js");

  // Request header should be available in RSC
  let el = page.getByText(`request-header`);
  await expect(el).toBeVisible();
});
