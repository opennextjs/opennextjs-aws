import { expect, test } from "@playwright/test";

test("Middleware Redirect", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "/Redirect" }).click();

  // URL is immediately redirected
  await page.waitForURL(`/redirect-destination`);
  let el = page.getByText("Redirect Destination", { exact: true });
  await expect(el).toBeVisible();

  // Loading page should also redirect
  await page.goto(`/redirect`);
  await page.waitForURL(`/redirect-destination`);
  el = page.getByText("Redirect Destination", { exact: true });
  await expect(el).toBeVisible();
});
