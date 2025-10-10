import { expect, test } from "@playwright/test";

test("Dynamic catch-all API route with hyphen param", async ({ request }) => {
  const res = await request.get("/api/auth/opennext/is/really/cool");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/json");
  const json = await res.json();
  expect(json).toStrictEqual({ slugs: ["opennext", "is", "really", "cool"] });
});
