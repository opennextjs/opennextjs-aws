import { expect, test } from "@playwright/test";
import { validateMd5 } from "../utils";

const EXT_PNG_MD5 = "405f45cc3397b09717a13ebd6f1e027b";

test.describe("Rewrites should work", () => {
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
    expect(validateMd5(await response.body(), EXT_PNG_MD5)).toBe(true);
  });

  test("Rewrite with query in destination", async ({ request }) => {
    const response = await request.get("/rewriteWithQuery");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ query: { q: "1" } });
  });

  test("Rewrite with query should merge query params", async ({ request }) => {
    const response = await request.get("/rewriteWithQuery?b=2");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ query: { q: "1", b: "2" } });
  });
});
