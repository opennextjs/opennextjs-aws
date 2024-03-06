import { expect, test } from "@playwright/test";

test("Image Optimization", async ({ page }) => {
  await page.goto("/");

  const imageResponsePromise = page.waitForResponse(
    /https%3A%2F%2Fopen-next.js.org%2Farchitecture.png/,
  );
  await page.locator('[href="/image-optimization"]').click();
  const imageResponse = await imageResponsePromise;

  await page.waitForURL("/image-optimization");

  const imageContentType = imageResponse.headers()["content-type"];
  expect(imageContentType).toBe("image/webp");

  let el = page.locator("img");
  await expect(el).toHaveJSProperty("complete", true);
  await expect(el).not.toHaveJSProperty("naturalWidth", 0);
});
