// import { expect, test } from "@playwright/test";

// test("Route modal and interception", async ({ page }) => {
//   await page.goto("/");
//   await page.getByRole("link", { name: "Albums" }).click();
//   await page
//     .getByRole("link", { name: "Song: I'm never gonna give you up Year: 1965" })
//     .click();

//   await page.waitForURL(
//     `/albums/Hold%20Me%20In%20Your%20Arms/I'm%20never%20gonna%20give%20you%20up`,
//   );

//   const modal = page.getByText("Modal", { exact: true });
//   await expect(modal).toBeVisible();

//   // Reload the page to load non intercepted modal
//   await page.reload();
//   await page.waitForURL(
//     `/albums/Hold%20Me%20In%20Your%20Arms/I'm%20never%20gonna%20give%20you%20up`,
//   );
//   const notModal = page.getByText("Not Modal", { exact: true });
//   await expect(notModal).toBeVisible();
// });
