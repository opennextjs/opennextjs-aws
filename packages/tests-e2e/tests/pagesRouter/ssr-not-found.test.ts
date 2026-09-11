import { expect, test } from "@playwright/test";

test("should render the 404 page for a getServerSideProps `notFound` result", async ({
  page,
}) => {
  const result = await page.goto("/ssr-not-found/");
  expect(result).toBeDefined();
  expect(result?.status()).toBe(404);

  // The route module renders a bare `This page could not be found` body when it cannot reach
  // `routerServerContext.render404`, so assert on the rendered 404 page rather than its text.
  await expect(page.locator("#__next")).toBeAttached();
});
