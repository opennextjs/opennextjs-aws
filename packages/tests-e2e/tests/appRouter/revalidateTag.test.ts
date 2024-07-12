import { expect, test } from "@playwright/test";

test("Revalidate tag", async ({ page, request }) => {
  test.setTimeout(45000);
  // We need to hit the page twice to make sure it's properly cached
  // Turbo might cache next build result, resulting in the tag being newer than the page
  // This can lead to the cache thinking that revalidate tag has been called when it hasn't
  // This is because S3 cache files are not uploaded if they have the same BuildId
  let responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/revalidate-tag");
  await responsePromise;

  responsePromise = page.waitForResponse((response) => {
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

test("Revalidate path", async ({ page, request }) => {
  await page.goto("/revalidate-path");

  let elLayout = page.getByText("Paris:");
  const initialParis = await elLayout.textContent();

  elLayout = page.getByText("London:");
  const initialLondon = await elLayout.textContent();

  // Send revalidate path request
  const result = await request.get("/api/revalidate-path");
  expect(result.status()).toEqual(200);
  const text = await result.text();
  expect(text).toEqual("ok");

  await page.goto("/revalidate-path");
  elLayout = page.getByText("Paris:");
  const newParis = await elLayout.textContent();
  expect(newParis).not.toEqual(initialParis);

  elLayout = page.getByText("London:");
  const newLondon = await elLayout.textContent();
  expect(newLondon).not.toEqual(initialLondon);
});
