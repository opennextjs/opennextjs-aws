import { expect, test } from "@playwright/test";

test("Single Rewrite", async ({ page }) => {
  await page.goto("/rewrite");

  let el = page.getByText("Nextjs Pages Router");
  await expect(el).toBeVisible();
});

test("Rewrite with query", async ({ page }) => {
  await page.goto("/rewriteUsingQuery?d=ssr");

  let el = page.getByText("SSR");
  await expect(el).toBeVisible();
});
