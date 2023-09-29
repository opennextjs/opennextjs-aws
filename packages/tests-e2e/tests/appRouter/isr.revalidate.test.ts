import { expect, test } from "@playwright/test";

test("Test revalidate", async ({ request }) => {
  const result = await request.get("/api/isr");

  expect(result.status()).toEqual(200);
  const body = await result.json();
  expect(body.result).toEqual(true);
  expect(body.cacheControl).toEqual(
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
});
