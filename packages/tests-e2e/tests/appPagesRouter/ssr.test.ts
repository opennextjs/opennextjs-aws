import { expect, test } from "@playwright/test";

import { wait } from "../utils";

test("Server Side Render", async ({ page }) => {
  await page.goto("/");
  await page.locator('[href="/ssr"]').click();

  await page.waitForURL("/ssr");
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
    expect(time).not.toEqual(newTime);
    time = newTime;
    await wait(250);
  }
});

test("Server Side Render with env", async ({ page }) => {
  await page.goto("/ssr");
  const el = page.getByText("Env:");
  expect(await el.textContent()).toEqual("Env: foo");
});
