import { expect, test } from "@playwright/test";

test("should return correctly on HEAD request with an empty body", async ({
  request,
}) => {
  const response = await request.head("/head");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toBe("");
  expect(response.headers()["x-from-middleware"]).toBe("true");
});

test("should return correctly for directly returning a fetch response", async ({
  request,
}) => {
  const response = await request.get("/fetch");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ hello: "world" });
});

test("should apply middleware request-header deletions in both routers", async ({
  request,
}) => {
  for (const path of [
    "/api/request-headers-app",
    "/api/request-headers-pages",
  ]) {
    let response = await request.get(path, {
      headers: { "x-untrusted-identity": "attacker" },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      untrustedIdentity: null,
      middlewareAdded: "trusted",
    });

    response = await request.get(path, {
      headers: { "X-Untrusted-Identity": "attacker" },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      untrustedIdentity: null,
      middlewareAdded: "trusted",
    });
  }
});
