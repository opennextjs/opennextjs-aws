import { expect, test } from "@playwright/test";

test("should test if poweredByHeader adds the correct headers ", async ({
  page,
}) => {
  const result = await page.goto("/");
  expect(result).toBeDefined();
  expect(result?.status()).toBe(200);
  const headers = result?.headers();

  // Both these headers should be present cause poweredByHeader is true in pagesRouter
  expect(headers?.["x-powered-by"]).toBe("Next.js");
  expect(headers?.["x-opennext"]).toBe("1");

  // Request ID header should not be set
  expect(headers?.["x-opennext-requestid"]).toBeUndefined();
});

test("[routing parity] applies a static configured response header", async ({
  request,
}) => {
  const response = await request.get("/");

  expect(response.status()).toBe(200);
  expect(response.headers()["x-custom-header"]).toBe("my custom header value");
});

// Next.js merges successful condition parameters after source parameters and
// compiles configured headers as non-path values.
// https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/server/lib/router-utils/resolve-routes.ts#L400-L414
test("[routing parity] interpolates condition parameters in headers", async ({
  request,
}) => {
  const response = await request.get(
    "/condition-headers/from-source/?tenant=condition&my-query=value-less&items=one&items=two",
  );
  const headers = response.headers();

  expect(headers["x-condition"]).toBe("value-less");
  expect(headers["x-items"]).toBe("one/two");
  expect(headers["x-route-url"]).toBe(
    "https://example.com/path?tenant=condition&next=(literal)+*",
  );
});
