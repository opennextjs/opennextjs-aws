import { expect, test } from "@playwright/test";

test("res.revalidate should work", async ({ page }) => {
  await page.goto("/revalidate/1");

  const initialUpdatedAt = await page.getByTestId("updated-at").textContent();

  const res = await page.request.post("/api/revalidate?key=1");
  const json = await res.json();

  expect(json).toEqual({ revalidated: true, path: "/revalidate/1" });

  if (!res.ok()) {
    throw new Error(`Failed to trigger revalidation: ${await res.text()}`);
  }

  // Wait for a short period to allow revalidation to complete
  await page.waitForTimeout(1000);
  await page.goto("/revalidate/1");

  const updatedUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(new Date(updatedUpdatedAt!).getTime()).toBeGreaterThan(
    new Date(initialUpdatedAt!).getTime(),
  );
});
