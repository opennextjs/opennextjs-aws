import { expect, test } from "@playwright/test";

test("should return correctly on HEAD request with an empty body", async ({
  request,
}) => {
  const response = await request.head("/head");
  const body = await response.text();
  expect(response.status()).toBe(200);
  expect(body).toBe("");
  expect(response.headers()["x-from-middleware"]).toBe("true");
});

test("should return correctly for directly returning a fetch response", async ({
  request,
}) => {
  const response = await request.get("/fetch");
  const body = await response.json();
  expect(response.status()).toBe(200);
  expect(body).toEqual({ hello: "world" });
});
