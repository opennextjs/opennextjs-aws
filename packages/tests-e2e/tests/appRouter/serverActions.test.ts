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

// A Server Action posted to a page that does not bundle it is forwarded by Next to the page that does.
// The forwarded request targets a dynamic route (`/server-actions/forwarded/[id]/edit`).
test("Server Action forwarded to a dynamic route", async ({ page }) => {
  await page.goto("/server-actions/forwarded/1/edit");
  await page.getByRole("textbox", { name: "Draft" }).fill("hello");

  // The editor saves the draft when it unmounts, the action is posted to the item page.
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("link", { name: "Back to item" }).click();
  await page.waitForURL("/server-actions/forwarded/1");
  await expect(page.getByRole("heading", { name: "Item 1" })).toBeVisible();

  const response = await responsePromise;
  expect(new URL(response.url()).pathname).toBe("/server-actions/forwarded/1");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/x-component");
  expect(await response.text()).toContain("Saved draft of item 1: hello");
});
