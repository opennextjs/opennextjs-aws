import { expect, test } from "@playwright/test";

test("Server Actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Server Actions" }).click();

  await page.waitForURL("/server-actions");
  let el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).not.toBeVisible();

  await page.getByRole("button", { name: "Fire Server Actions" }).click();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).toBeVisible();

  // Reload page
  await page.reload();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).not.toBeVisible();
  await page.getByRole("button", { name: "Fire Server Actions" }).click();
  el = page.getByText("Song: I'm never gonna give you up");
  await expect(el).toBeVisible();
});

// A form submitted before hydration or with JavaScript disabled is a multipart POST
// whose server action id is in the body, not in the `next-action` header. This app
// runs with `dangerous.enableCacheInterception` and /server-actions is prerendered,
// so the POST must reach NextServer instead of being answered with the cached page.
test.describe("Server Actions without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("form action runs on a prerendered page", async ({ page }) => {
    const response = await page.goto("/server-actions");
    expect(response?.headers()["x-opennext-cache"]).toEqual("HIT");

    await page.getByRole("textbox", { name: "Query" }).fill("e2etest");
    await page.getByRole("button", { name: "Submit Form Action" }).click();

    // The action redirects, the cached page would leave us on /server-actions
    await expect(page).toHaveURL("/search-query?searchParams=e2etest");
    await expect(
      page.getByText("Search Params via Props: e2etest"),
    ).toBeVisible();
  });
});
