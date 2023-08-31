import { wait } from "@open-next/utils";
import { expect, test } from "@playwright/test";

test("Incremental Static Regeneration", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.locator('[href="/pages_isr"]').click();

  await page.waitForURL("/pages_isr");
  // Load the page a couple times to regenerate ISR

  let el = page.getByText("ISR").first();
  // Track the static time
  let time = await el.textContent();
  let newTime;
  let tempTime = time;
  do {
    await wait(1000);
    await page.reload();
    time = tempTime;
    el = page.getByText("ISR");
    newTime = await el.textContent();
    tempTime = newTime;
  } while (time !== newTime);
  await page.reload();

  el = page.getByText("ISR");
  newTime = await el.textContent();

  // Wait 10 seconds for ISR to regenerate time
  await wait(15000);
  await page.reload();
  await wait(5000);
  await page.reload();
  await wait(5000);
  await page.reload();
  el = page.getByText("ISR");
  newTime = await el.textContent();

  expect(time).not.toEqual(newTime);
});
