import { expect, test } from "@playwright/test";

test("res.revalidate should work", async ({ page }) => {
  // Load the page initially and get the initial updatedAt value
  await page.goto("/revalidate/1");
  const initialUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(initialUpdatedAt).toBe(initialUpdatedAt);

  // Reload the page again to ensure its SSG
  await page.reload();
  const reloadedUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(reloadedUpdatedAt).toBe(initialUpdatedAt);

  // Trigger revalidation via the API route
  const res = await page.request.post("/api/revalidate/?key=1");
  const json = await res.json();

  expect(json).toEqual({ revalidated: true, path: "/revalidate/1" });

  if (!res.ok()) {
    throw new Error(`Failed to trigger revalidation: ${await res.text()}`);
  }

  // Reload the page to get the updated content after revalidation
  // It should be greater than `initialUpdatedAt`
  await page.reload();

  const updatedUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(new Date(updatedUpdatedAt!).getTime()).toBeGreaterThan(
    new Date(initialUpdatedAt!).getTime(),
  );
});
