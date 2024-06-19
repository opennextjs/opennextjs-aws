// NOTE: loading.tsx is currently broken on open - next
//  This works locally but not on deployed apps

import { wait } from "@open-next/utils";
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
    await page.reload();

    loading = page.getByText("Loading...");
    await expect(loading).toBeVisible();
    let el = page.getByText("Time:");
    await expect(el).toBeVisible();
    const time = await el.textContent();
    expect(time).not.toEqual(lastTime);
    lastTime = time!;
    await wait(1000);
  }

  // let loading = page.getByText("Loading...");
  // await expect(loading).toBeVisible();

  // let el = page.getByText("Time:");
  // await expect(el).toBeVisible();
  // const time = await el.textContent();

  // page.reload();
  // loading = page.getByText("Loading...");
  // await expect(loading).toBeVisible();

  // el = page.getByText("Time:");
  // let newTime = await el.textContent();
  // await expect(el).toBeVisible();
  // await expect(time).not.toEqual(newTime);

  // await wait(5000);
  // page.reload();
  // loading = page.getByText("Loading...");
  // await expect(loading).toBeVisible();

  // el = page.getByText("Time:");
  // newTime = await el.textContent();
  // await expect(el).toBeVisible();
  // await expect(time).not.toEqual(newTime);
});
