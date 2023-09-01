import { expect, test } from "@playwright/test";

/**
 * Tests that the headers are available in RSC and response headers
 */
test("Headers", async ({ page }) => {
  await page.goto("/");
  await page.locator('[href="/headers"]').click();
  const response = await page.waitForResponse(
    (response) => !!response.status(),
  );

  // Response header should be set
  const headers = response.headers();
  await expect(headers["response-header"]).toEqual("response-header");
  // Request header should be available in RSC
  let el = page.getByText(`request-header`);
  await expect(el).toBeVisible();
});
