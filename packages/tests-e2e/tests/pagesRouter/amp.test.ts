import { expect, test } from "@playwright/test";

test.describe("next/amp", () => {
  test("should load and display the timeago component", async ({ page }) => {
    await page.goto("/amp");
    const timeago = await page.getByTestId("amp-timeago").textContent();
    expect(timeago).toBe("just now");
    const htmlEl = page.locator("html");
    await expect(htmlEl).toHaveAttribute("amp");
  });
});
