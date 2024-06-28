import { expect, test } from "@playwright/test";

test("Single redirect", async ({ page }) => {
  await page.goto("/next-config-redirect-without-locale-support/");

  await page.waitForURL("https://open-next.js.org/");
  let el = page.getByRole("heading", { name: "Open source Next.js adapter" });
  await expect(el).toBeVisible();
});
