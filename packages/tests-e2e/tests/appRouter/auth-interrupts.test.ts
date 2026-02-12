import { expect, test } from "@playwright/test";

const NO_CACHE_HEADER =
  "private, no-cache, no-store, max-age=0, must-revalidate";

test("test forbidden", async ({ page }) => {
  const result = await page.goto("/auth-interrupts/forbidden");
  expect(result).toBeDefined();
  expect(result?.status()).toBe(403);

  const headers = result?.headers();
  expect(headers?.["cache-control"]).toBe(NO_CACHE_HEADER);

  const heading = page.getByText("Forbidden");
  await expect(heading).toBeVisible();
});

test("test unauthorized", async ({ page }) => {
  const result = await page.goto("/auth-interrupts/unauthorized");
  expect(result).toBeDefined();
  expect(result?.status()).toBe(401);

  const headers = result?.headers();
  expect(headers?.["cache-control"]).toBe(NO_CACHE_HEADER);

  const heading = page.getByText("Unauthorized");
  await expect(heading).toBeVisible();
});
