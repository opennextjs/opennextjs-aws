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
