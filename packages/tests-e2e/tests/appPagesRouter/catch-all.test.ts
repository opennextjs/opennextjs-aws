import { test } from "@playwright/test";

// Going to `/`, `/conico974`, `/kheuzy` and `/sommeeer` should be catched by our `[[...page]]` route.
test("Optional Catch all route in root should work", async ({ page }) => {
  await page.goto("/");
  await page.locator("h1").getByText("App Router").isVisible();
  await page.locator("h1").getByText("Pages Router").isVisible();

  await page.goto("/conico974");
  const pElement = page.getByText("Path: conico974", { exact: true });
  await pElement.isVisible();
});
