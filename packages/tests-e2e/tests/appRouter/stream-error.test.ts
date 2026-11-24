import { expect, test } from "@playwright/test";

test("responds with a 500 when the body stream errors before its first chunk", async ({
  request,
}) => {
  const res = await request.get("/api/stream-error", { timeout: 10_000 });

  expect(res.status()).toBe(500);
  expect(res.headers()["cache-control"]).toBe(
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  expect(res.headers()["set-cookie"]).toBeUndefined();
  expect(await res.text()).toBe("");
});
