// NOTE: loading.tsx is currently broken on open - next
//  This works locally but not on deployed apps

import { expect, test } from "@playwright/test";

// NOTE: We don't await page load b/c we want to see the Loading page
test("Server Side Render and loading.tsx", async ({ page }) => {
  test.setTimeout(600000);
  await page.goto("/");
  await page.getByRole("link", { name: "SSR" }).click();
  await page.waitForURL("/ssr");

  let loading: any;
  let lastTime = "";

  for (let i = 0; i < 5; i++) {
    void page.reload();

    loading = page.getByText("Loading...");
    await expect(loading).toBeVisible();
    const el = page.getByText("Time:");
    await expect(el).toBeVisible();
    const time = await el.textContent();
    expect(time).not.toEqual(lastTime);
    lastTime = time!;
    await page.waitForTimeout(1000);
  }
});

test("Fetch cache properly cached", async ({ page }) => {
  await page.goto("/ssr");
  const originalDate = await page.getByText("Cached fetch:").textContent();
  await page.waitForTimeout(2000);
  await page.reload();
  const newDate = await page.getByText("Cached fetch:").textContent();
  expect(originalDate).toEqual(newDate);
});
