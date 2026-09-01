import { expect, test } from "@playwright/test";
import { validateMd5 } from "../utils";

// md5sum of examples/app-router/public/static/kimono.avif
const KIMONO_AVIF_MD5 = "4d1c462db1d47d8db425821c86d5c473";

test("Image Optimization", async ({ page }) => {
  await page.goto("/");

  const imageResponsePromise = page.waitForResponse(
    /https%3A%2F%2Fopennext.js.org%2Farchitecture.png/,
  );
  await page.locator('[href="/image-optimization"]').click();
  const imageResponse = await imageResponsePromise;

  await page.waitForURL("/image-optimization");

  const imageContentType = imageResponse.headers()["content-type"];
  expect(imageContentType).toBe("image/webp");

  const el = page.locator("img");
  await expect(el).toHaveJSProperty("complete", true);
  await expect(el).not.toHaveJSProperty("naturalWidth", 0);
});

test("should return 400 when validateParams returns an errorMessage", async ({
  request,
}) => {
  const res = await request.get("/_next/image");
  expect(res.status()).toBe(400);
  expect(res.headers()["cache-control"]).toBe("public,max-age=60,immutable");
  expect(await res.text()).toBe(`"url" parameter is required`);
});

test("should optimize avif images", async ({ request }) => {
  // https://github.com/vercel/next.js/releases/tag/v16.3.4
  // The AVIF image optimization renabled in Next.js v16.3.4
  const res = await request.get(
    "/_next/image?url=%2Fstatic%2Fkimono.avif&w=384&q=75",
    { headers: { accept: "image/webp" } },
  );

  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/avif");
  // Byte-identical to the source asset => no re-encoding happened at all.
  expect(validateMd5(await res.body(), KIMONO_AVIF_MD5)).toBe(true);
});
