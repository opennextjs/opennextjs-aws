import { expect, test } from "@playwright/test";

test("Single redirect", async ({ page }) => {
  await page.goto("/next-config-redirect-without-locale-support/");

  await page.waitForURL("https://opennext.js.org/");
  const el = page.getByRole("heading", { name: "OpenNext" });
  await expect(el).toBeVisible();
});

test("Redirect with default locale support", async ({ page }) => {
  await page.goto("/redirect-with-locale/");

  await page.waitForURL("/ssr/");
  const el = page.getByText("SSR");
  await expect(el).toBeVisible();
});

test("Redirect with locale support", async ({ page }) => {
  await page.goto("/nl/redirect-with-locale/");

  await page.waitForURL("/nl/ssr/");
  const el = page.getByText("SSR");
  await expect(el).toBeVisible();
});

// Request-level coverage for route-condition matching and empty optional
// catch-all compilation. https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes-catchall/custom-routes-catchall.test.ts
test("[routing parity] redirects only an exact protocol match", async ({
  request,
}) => {
  const redirect = await request.get("/protocol-redirect/", {
    headers: { "x-protocol": "http" },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(307);
  expect(new URL(redirect.headers().location ?? "").href).toBe(
    "https://localhost:3002/",
  );

  const fallthrough = await request.get("/protocol-redirect/", {
    headers: { "x-protocol": "https" },
    maxRedirects: 0,
  });
  expect(fallthrough.status()).toBe(404);
  expect(fallthrough.headers().location).toBeUndefined();
});
