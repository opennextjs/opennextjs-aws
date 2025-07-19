import { expect, test } from "@playwright/test";

test.describe("next/head", () => {
  test("should have the correct title", async ({ page }) => {
    await page.goto("/head");
    const title = await page.title();
    expect(title).toBe("OpenNext head");
  });
  test("should have the correct meta tags", async ({ page }) => {
    await page.goto("/head");
    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    const ogDesc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    const time = await page
      .locator('meta[property="time"]')
      .getAttribute("content");
    expect(ogTitle).toBe("OpenNext pages router head bar");
    expect(ogDesc).toBe(
      "OpenNext takes the Next.js build output and converts it into packages that can be deployed across a variety of environments. Natively OpenNext has support for AWS Lambda, Cloudflare, and classic Node.js Server.",
    );

    expect(new Date(time!).getTime()).toBeLessThan(Date.now());
  });
});
