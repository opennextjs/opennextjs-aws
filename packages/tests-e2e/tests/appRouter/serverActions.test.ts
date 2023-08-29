import { expect, test } from "@playwright/test";

test("Server Actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Server Actions" }).click();

  await page.waitForURL("/server-actions");
  let el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).not.toBeVisible();

  await page.getByRole("button", { name: "Fire Server Actions" }).click();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).toBeVisible();

  // Reload page
  await page.reload();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).not.toBeVisible();
  await page.getByRole("button", { name: "Fire Server Actions" }).click();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).toBeVisible();
});
