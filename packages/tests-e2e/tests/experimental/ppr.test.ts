import { expect, test } from "@playwright/test";

test("PPR should show loading first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Incremental PPR" }).click();
  await page.waitForURL("/ppr");
  const loading = page.getByText("Loading...");
  await expect(loading).toBeVisible();
  const el = page.getByText("Dynamic Component");
  await expect(el).toBeVisible();
});

test("PPR rsc prefetch request should be cached", async ({ request }) => {
  const resp = await request.get("/ppr", {
    headers: { rsc: "1", "next-router-prefetch": "1" },
  });
  expect(resp.status()).toEqual(200);
  const headers = resp.headers();
  expect(headers["x-nextjs-postponed"]).toEqual("1");
  expect(headers["x-nextjs-cache"]).toEqual("HIT");
  expect(headers["cache-control"]).toEqual("s-maxage=31536000");
});
