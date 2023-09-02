import { expect, test } from "@playwright/test";

/**
 * Tests that the request.url is the deployed host and not localhost
 */
test("Request.url is host", async ({ baseURL, page }) => {
  await page.goto("/api/host");

  let el = page.getByText(`{"url":"${baseURL}/api/host"}`);
  await expect(el).toBeVisible();
});
