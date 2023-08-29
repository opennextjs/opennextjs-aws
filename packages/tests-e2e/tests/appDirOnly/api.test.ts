import { expect, test } from "@playwright/test";

test("API call from client", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "/API" }).click();

  await page.waitForURL("/api");

  let el = page.getByText("API: N/A");
  await expect(el).toBeVisible();

  await page.getByRole("button", { name: "Call /api/client" }).click();
  el = page.getByText('API: { "hello": "client" }');
  await expect(el).toBeVisible();
});

test("API call from middleware", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "/API" }).click();

  await page.waitForURL("/api");

  let el = page.getByText("API: N/A");
  await expect(el).toBeVisible();

  await page.getByRole("button", { name: "Call /api/middleware" }).click();
  el = page.getByText('API: { "hello": "middleware" }');
  await expect(el).toBeVisible();
});
