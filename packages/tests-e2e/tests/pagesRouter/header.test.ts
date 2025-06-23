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
