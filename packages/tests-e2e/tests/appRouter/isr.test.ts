import { wait } from "@open-next/utils";
import { expect, test } from "@playwright/test";

test("Incremental Static Regeneration", async ({ page }) => {
  test.setTimeout(45000);
  await page.goto("/");
  await page.getByRole("link", { name: "ISR" }).click();
  // Load the page a couple times to regenerate ISR

  let el = page.getByText("ISR");
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

  await wait(1000);
  el = page.getByText("ISR");
  const midTime = await el.textContent();
  // Expect that the time is still stale
  expect(midTime).toEqual(newTime);

  // Wait 10 + 1 seconds for ISR to regenerate time
  await wait(11000);
  let finalTime = newTime;
  do {
    await wait(2000);
    el = page.getByText("ISR");
    finalTime = await el.textContent();
    await page.reload();
  } while (newTime === finalTime);

  expect(newTime).not.toEqual(finalTime);
});
