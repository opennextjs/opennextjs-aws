import { expect, test } from "playwright/test";

test("should return 500 on middleware error", async ({ request }) => {
  const response = await request.get("/", {
    headers: {
      "x-throw": "true",
    },
  });
  const body = await response.text();
  expect(response.status()).toBe(500);
  expect(body).toContain("Internal Server Error");
});

test("middleware rewrite — direct navigation renders the rewritten page", async ({
  page,
}) => {
  await page.goto("/rewrite-client-path/foo");
  await expect(
    page.getByRole("heading", { name: "Rewrite Code Path" }),
  ).toBeVisible();
});

test("middleware rewrite — client-side navigation renders the rewritten page", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('a[href="/rewrite-client-path/foo/"]').click();
  await page.waitForURL("**/rewrite-client-path/foo/");
  await expect(
    page.getByRole("heading", { name: "Rewrite Code Path" }),
  ).toBeVisible();
});
