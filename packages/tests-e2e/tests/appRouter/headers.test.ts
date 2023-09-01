import { expect, test } from "@playwright/test";

/**
 * Tests that the headers are available in RSC and response headers
 */
test("Headers", async ({ page }) => {
  // Don't await here so we can wait for response in next line
  page.goto("/headers");
  const response = await page.waitForResponse((response) => {
    return response.status() === 200;
  });

  // Response header should be set
  const headers = response.headers();
  await expect(headers["response-header"]).toEqual("response-header");
  // Request header should be available in RSC
  let el = page.getByText(`request-header`);
  await expect(el).toBeVisible();
});
