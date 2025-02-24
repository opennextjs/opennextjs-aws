import { expect, test } from "@playwright/test";

// NOTE: We don't await page load b/c we want to see the Loading page
test("Server Sent Events", async ({ page }) => {
  await page.goto("/");
  await page.locator('[href="/sse"]').click();
  await page.waitForURL("/sse");

  const msg0 = page.getByText(`Message 0: {"message":"open"`);
  await expect(msg0).toBeVisible();

  // 2nd message shouldn't arrive yet
  let msg2 = page.getByText(`Message 2: {"message":"hello:2"`);
  await expect(msg2).not.toBeVisible();
  await page.waitForTimeout(2000);
  // 2nd message should arrive after 2s
  msg2 = page.getByText(`Message 2: {"message":"hello:2"`);
  await expect(msg2).toBeVisible();

  // 3rd message shouldn't arrive yet
  let msg3 = page.getByText(`Message 3: {"message":"hello:3"`);
  await expect(msg3).not.toBeVisible();
  await page.waitForTimeout(2000);
  // 3rd message should arrive after 2s
  msg3 = page.getByText(`Message 3: {"message":"hello:3"`);
  await expect(msg3).toBeVisible();

  // 4th message shouldn't arrive yet
  let msg4 = page.getByText(`Message 4: {"message":"hello:4"`);
  await expect(msg4).not.toBeVisible();
  await page.waitForTimeout(2000);
  // 4th message should arrive after 2s
  msg4 = page.getByText(`Message 4: {"message":"hello:4"`);
  await expect(msg4).toBeVisible();

  let close = page.getByText(`Message 5: {"message":"close"`);
  await expect(close).not.toBeVisible();

  await page.waitForTimeout(2000);
  close = page.getByText(`Message 5: {"message":"close"`);
  await expect(close).toBeVisible();
});
