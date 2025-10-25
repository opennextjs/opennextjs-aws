import { expect, test } from "@playwright/test";

test.describe("next/amp", () => {
  // amp is removed in Next.js 16+
  test.skip("should load and display the timeago component", async ({
    page,
  }) => {
    await page.goto("/amp");
    const timeago = await page.getByTestId("amp-timeago").textContent();
    // We can safely assume this will always show `just now` as its using `format()` from `timeago.js`.
    // It will show `just now` if the time is less than 10s ago.
    expect(timeago).toBe("just now");
    const htmlEl = page.locator("html");
    await expect(htmlEl).toHaveAttribute("amp");
  });
});
