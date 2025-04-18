import { expect, test } from "@playwright/test";

test("Node middleware should add headers", async ({ request }) => {
  const resp = await request.get("/");
  expect(resp.status()).toEqual(200);
  const headers = resp.headers();
  expect(headers["x-middleware-test"]).toEqual("1");
  expect(headers["x-random-node"]).toBeDefined();
});

test("Node middleware should return json", async ({ request }) => {
  const resp = await request.get("/api/hello");
  expect(resp.status()).toEqual(200);
  const json = await resp.json();
  expect(json).toEqual({ name: "World" });
});

test("Node middleware should redirect", async ({ page }) => {
  await page.goto("/redirect");
  await page.waitForURL("/");
  const el = page.getByText("Incremental PPR");
  await expect(el).toBeVisible();
});

test("Node middleware should rewrite", async ({ page }) => {
  await page.goto("/rewrite");
  const el = page.getByText("Incremental PPR");
  await expect(el).toBeVisible();
});
