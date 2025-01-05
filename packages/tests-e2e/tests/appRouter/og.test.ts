import { expect, test } from "@playwright/test";

test("Open-graph image to be in metatags and present", async ({
  page,
  request,
}) => {
  await page.goto("/og");

  // Wait for meta tags to be present
  const ogImageSrc = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  const ogImageAlt = await page
    .locator('meta[property="og:image:alt"]')
    .getAttribute("content");
  const ogImageType = await page
    .locator('meta[property="og:image:type"]')
    .getAttribute("content");
  const ogImageWidth = await page
    .locator('meta[property="og:image:width"]')
    .getAttribute("content");
  const ogImageHeight = await page
    .locator('meta[property="og:image:height"]')
    .getAttribute("content");

  // Verify meta tag exists and is the correct values
  expect(ogImageSrc).not.toBe(null);
  expect(ogImageAlt).toBe("OpenNext");
  expect(ogImageType).toBe("image/png");
  expect(ogImageWidth).toBe("1200");
  expect(ogImageHeight).toBe("630");

  // Check if the image source is working
  const response = await request.get(`/og/${ogImageSrc?.split("/").at(-1)}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toBe(
    "public, immutable, no-transform, max-age=31536000",
  );
});

test("next/og (vercel/og) to work in API route", async ({ request }) => {
  const response = await request.get("api/og?title=opennext");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toBe(
    "public, immutable, no-transform, max-age=31536000",
  );
});
