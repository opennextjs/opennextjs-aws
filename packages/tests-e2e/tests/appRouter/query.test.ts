import { expect, test } from "@playwright/test";

/**
 * Tests that query params are available in middleware and RSC
 */
test("SearchQuery", async ({ page }) => {
  await page.goto("/search-query?searchParams=e2etest&multi=one&multi=two");

  let propsEl = page.getByText(`Search Params via Props: e2etest`);
  let mwEl = page.getByText(`Search Params via Middleware: mw/e2etest`);
  let multiEl = page.getByText(`Multi-value Params (key: multi): 2`);
  let multiOne = page.getByText(`one`);
  let multiTwo = page.getByText(`two`);
  await expect(propsEl).toBeVisible();
  await expect(mwEl).toBeVisible();
  await expect(multiEl).toBeVisible();
  await expect(multiOne).toBeVisible();
  await expect(multiTwo).toBeVisible();
});
