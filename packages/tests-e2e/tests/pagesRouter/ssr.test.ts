import { wait } from "@open-next/utils";
import { expect, test } from "@playwright/test";

test("Server Side Render", async ({ page }) => {
  await page.goto("/");
  await page.locator('[href="/ssr/"]').click();

  await page.waitForURL("/ssr/");
  let el = page.getByText("Time:");
  await expect(el).toBeVisible();
  let time = await el.textContent();

  await page.reload();

  el = page.getByText("Time:");
  let newTime = await el.textContent();
  await expect(el).toBeVisible();

  for (let i = 0; i < 5; i++) {
    await page.reload();
    el = page.getByText("Time:");
    newTime = await el.textContent();
    await expect(el).toBeVisible();
    await expect(time).not.toEqual(newTime);
    time = newTime;
    await wait(250);
  }
});
