import { expect, test } from "@playwright/test";

test("Parallel routes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Parallel" }).click();

  await page.waitForURL(`/parallel`);

  // Neither are selected, so A/B shouldn't be rendered
  let routeA = page.getByText("Parallel Route A");
  let routeB = page.getByText("Parallel Route B");
  await expect(routeA).not.toBeVisible();
  await expect(routeB).not.toBeVisible();

  // Enable A, which should be visible but not B
  await page.locator('input[name="a"]').check();
  routeA = page.getByText("Parallel Route A");
  await expect(routeA).toBeVisible();
  await expect(routeB).not.toBeVisible();

  // Enable B, both should be visible
  await page.locator('input[name="b"]').check();
  routeB = page.getByText("Parallel Route B");
  await expect(routeA).toBeVisible();
  await expect(routeB).toBeVisible();

  // Click on A, should go to a-page
  await page.getByText("Go to a-page").click();
  await page.waitForURL("/parallel/a-page");

  // Should render contents of a-page
  routeA = page.getByText("A Page");
  await expect(routeA).toBeVisible();

  // Click on B, should go to b-page
  await page.getByText("Go to b-page").click();
  await page.waitForURL("/parallel/b-page");

  // Should render contents of b-page
  routeB = page.getByText("B Page");
  await expect(routeB).toBeVisible();
});
