// TOD: enable when 13.4.13 PRs are merged
// import { test, expect } from "@playwright/test";

// /**
//  * Tests that the request.url is the deployed host and not localhost
//  */
// test("API call from client", async ({ baseURL, page }) => {
//   await page.goto("/api/host");

//   let el = page.getByText(`{"url":"${baseURL}/api/host"}`);
//   await expect(el).toBeVisible();
// });
