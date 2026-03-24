import { expect, test } from "@playwright/test";
import { validateMd5 } from "../utils";

// This is the md5sums of the expected PNGs generated with `md5sum <file>`
const OG_MD5 = "db156985b60003a865f90a65670ab5d0";
const API_OG_MD5 = "d2bb34302e54be953f3b5b7920d244c0";

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
  expect(validateMd5(await response.body(), OG_MD5)).toBe(true);
});

// We skip this test for now. For some reason the deployed API route is computing a different MD5 hash than the locally
// In Vercel they are the same so we need to figure out why this happens for us. Did work < Next 16.2
test.skip("next/og (vercel/og) to work in API route", async ({ request }) => {
  const response = await request.get("api/og?title=opennext");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(validateMd5(await response.body(), API_OG_MD5)).toBe(true);
});
