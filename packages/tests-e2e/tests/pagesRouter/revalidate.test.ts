import { expect, test } from "@playwright/test";

test("res.revalidate should revalidate the page", async ({ page, request }) => {
  // The page is SSG: it is served from the cache until it is revalidated
  const initialResponse = await page.goto("/revalidate/1");
  const headers = initialResponse?.headers() ?? {};
  expect(headers["x-nextjs-cache"] ?? headers["x-opennext-cache"]).toBe("HIT");
  const initialUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(initialUpdatedAt).toBeTruthy();

  await page.reload();
  const reloadedUpdatedAt = await page.getByTestId("updated-at").textContent();
  expect(reloadedUpdatedAt).toBe(initialUpdatedAt);

  // Trigger the revalidation from an API route
  const res = await request.post("/api/revalidate?key=1");
  expect(res.ok(), await res.text()).toBe(true);
  expect(await res.json()).toEqual({
    revalidated: true,
    path: "/revalidate/1",
  });

  // `res.revalidate` resolves once the page has been regenerated
  await page.reload();
  const revalidatedUpdatedAt = await page
    .getByTestId("updated-at")
    .textContent();
  expect(new Date(revalidatedUpdatedAt!).getTime()).toBeGreaterThan(
    new Date(initialUpdatedAt!).getTime(),
  );
});
