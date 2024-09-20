import { expect, test } from "@playwright/test";

test("Next config headers with i18n", async ({ page }) => {
  const responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/");

  const response = await responsePromise;
  // Response header should be set
  const headers = response.headers();
  // Headers from next.config.js should be set
  expect(headers["x-custom-header"]).toEqual("my custom header value");

  // Headers from middleware should be set
  expect(headers["x-from-middleware"]).toEqual("true");
});
