import { expect, test } from "@playwright/test";

/**
 * Tests that query params are available in middleware and RSC
 */
test("SearchQuery", async ({ page }) => {
  await page.goto("/search-query?searchParams=e2etest");

  let propsEl = page.getByText(`Search Params via Props: e2etest`);
  let mwEl = page.getByText(`Search Params via Middleware: mw/e2etest`);
  await expect(propsEl).toBeVisible();
  await expect(mwEl).toBeVisible();
});
