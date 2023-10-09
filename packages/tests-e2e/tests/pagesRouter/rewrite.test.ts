import { expect, test } from "@playwright/test";

test("Single Rewrite", async ({ page }) => {
  await page.goto("/rewrite");

  let el = page.getByText("Nextjs Pages Router");
  await expect(el).toBeVisible();
});
