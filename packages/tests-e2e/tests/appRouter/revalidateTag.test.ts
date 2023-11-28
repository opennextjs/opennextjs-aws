import { expect, test } from "@playwright/test";

test("Revalidate tag", async ({ page, request }) => {
  test.setTimeout(45000);
  let responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/revalidate-tag");
  let elLayout = page.getByText("Fetched time:");
  let time = await elLayout.textContent();
  let newTime;

  let response = await responsePromise;
  const nextCacheHeader = response.headers()["x-nextjs-cache"];
  expect(nextCacheHeader).toMatch(/^(HIT|STALE)$/);

  // Send revalidate tag request

  const result = await request.get("/api/revalidate-tag");
  expect(result.status()).toEqual(200);
  const text = await result.text();
  expect(text).toEqual("ok");

  responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.reload();
  elLayout = page.getByText("Fetched time:");
  newTime = await elLayout.textContent();

  expect(newTime).not.toEqual(time);

  response = await responsePromise;
  expect(response.headers()["x-nextjs-cache"]).toEqual("MISS");

  //Check if nested page is also a miss
  responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/revalidate-tag/nested");
  elLayout = page.getByText("Fetched time:");
  newTime = await elLayout.textContent();
  expect(newTime).not.toEqual(time);

  response = await responsePromise;
  expect(response.headers()["x-nextjs-cache"]).toEqual("MISS");

  // If we hit the page again, it should be a hit
  responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/revalidate-tag/nested");

  response = await responsePromise;
  expect(response.headers()["x-nextjs-cache"]).toEqual("HIT");
});
