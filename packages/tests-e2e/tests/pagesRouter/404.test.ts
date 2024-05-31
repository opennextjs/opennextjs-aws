import { expect, test } from "@playwright/test";

test("should return 404 on a route not corresponding to any route", async ({
  page,
}) => {
  const result = await page.goto("/not-existing/route");
  expect(result).toBeDefined();
  expect(result?.status()).toBe(404);
  const headers = result?.headers();
  expect(headers?.["cache-control"]).toBe(
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
});
