import { expect, test } from "@playwright/test";

test("should not fail on an api route", async ({ page }) => {
  const result = await page.goto("/api/hello");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ hello: "OpenNext rocks!" });
});

test("should work with dynamic api route", async ({ page }) => {
  const result = await page.goto("/api/dynamic/opennext");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ slug: "opennext" });
});

test("should work with catch all api route", async ({ page }) => {
  const result = await page.goto("/api/dynamic/catch-all/first/second/third");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ slug: ["first", "second", "third"] });
});

test("dynamic route should take precedence over catch all", async ({
  page,
}) => {
  const result = await page.goto("/api/dynamic/catch-all");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ slug: "catch-all" });
});

test("should work with optional catch all api route", async ({ page }) => {
  const result = await page.goto("/api/dynamic/catch-all-optional");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ optional: "true" });
});

// This should work but it doesn't. It seems that the predefined api route is not taking precedence.
// Its broken in `next start` aswell.
// Issue currently open in Next: https://github.com/vercel/next.js/issues/76765
test.skip("predefined api route should take presedence", async ({ page }) => {
  const result = await page.goto("/api/dynamic/precedence");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ precedence: "true" });
});
