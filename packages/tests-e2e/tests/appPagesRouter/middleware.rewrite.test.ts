import { expect, test } from "@playwright/test";

test.describe("Middleware Rewrite", () => {
  test("Simple Middleware Rewrite", async ({ page }) => {
    await page.goto("/");
    await page.locator('[href="/rewrite"]').click();

    await page.waitForURL("/rewrite");
    let el = page.getByText("Rewritten Destination", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("a: b", { exact: true });
    await expect(el).toBeVisible();
    // Loading page should also rewrite
    await page.goto("/rewrite");
    await page.waitForURL("/rewrite");
    el = page.getByText("Rewritten Destination", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("a: b", { exact: true });
    await expect(el).toBeVisible();
  });

  test("Middleware Rewrite with multiple search params", async ({ page }) => {
    await page.goto("/rewrite-multi-params");
    let el = page.getByText("Rewritten Destination", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("a: b", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("multi: 0, 1, 2", { exact: true });
    await expect(el).toBeVisible();
  });

  test("Middleware Rewrite should override original search params", async ({
    page,
  }) => {
    await page.goto("/rewrite?a=1&multi=3");
    let el = page.getByText("Rewritten Destination", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("a: b", { exact: true });
    await expect(el).toBeVisible();
    el = page.getByText("multi:", { exact: true });
    await expect(el).toBeVisible();
    await expect(el).toHaveText("multi:");
  });
});
