import { expect, test } from "@playwright/test";

test("Middleware Rewrite", async ({ page }) => {
  await page.goto("/");
  await page.locator('[href="/rewrite"]').click();

  await page.waitForURL(`/rewrite`);
  let el = page.getByText("Rewritten Destination", { exact: true });
  await expect(el).toBeVisible();
  el = page.getByText("a: b", { exact: true });
  await expect(el).toBeVisible();
  // Loading page should also rewrite
  await page.goto(`/rewrite`);
  await page.waitForURL(`/rewrite`);
  el = page.getByText("Rewritten Destination", { exact: true });
  await expect(el).toBeVisible();
  el = page.getByText("a: b", { exact: true });
  await expect(el).toBeVisible();
});
