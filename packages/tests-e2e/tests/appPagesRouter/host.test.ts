import { expect, test } from "@playwright/test";

/**
 * Tests that the request.url is the deployed host and not localhost
 */
test("Request.url is host", async ({ baseURL, page }) => {
  // We skip this test when E2E is run locally with `http` as protocol.
  // The cause can be seen here: https://github.com/opennextjs/opennextjs-aws/issues/969#issuecomment-3239569901
  test.skip(
    (baseURL ?? "").includes("http://localhost"),
    "Skipping test on localhost",
  );
  await page.goto("/api/host");

  const el = page.getByText(`{"url":"${baseURL}/api/host"}`);
  await expect(el).toBeVisible();
});
