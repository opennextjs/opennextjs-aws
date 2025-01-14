import { expect, test } from "@playwright/test";
import { validateMd5 } from "../utils";

const OG_MD5 = "405f45cc3397b09717a13ebd6f1e027b";

test("Single Rewrite", async ({ page }) => {
  await page.goto("/rewrite");

  const el = page.getByText("Nextjs Pages Router");
  await expect(el).toBeVisible();
});

test("Rewrite with query", async ({ page }) => {
  await page.goto("/rewriteUsingQuery?d=ssr");

  const el = page.getByText("SSR");
  await expect(el).toBeVisible();
});

test("Rewrite to external image", async ({ request }) => {
  const response = await request.get("/external-on-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(validateMd5(await response.body(), OG_MD5)).toBe(true);
});
