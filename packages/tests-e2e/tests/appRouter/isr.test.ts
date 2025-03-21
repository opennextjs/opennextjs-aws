import { expect, test } from "@playwright/test";

test("Incremental Static Regeneration", async ({ page }) => {
  test.setTimeout(45000);
  await page.goto("/");
  await page.locator("[href='/isr']").click();
  // Load the page a couple times to regenerate ISR

  let el = page.getByText("Time:");
  // Track the static time
  let time = await el.textContent();
  let newTime: typeof time;
  let tempTime = time;
  do {
    await page.waitForTimeout(1000);
    await page.reload();
    time = tempTime;
    el = page.getByText("Time:");
    newTime = await el.textContent();
    tempTime = newTime;
  } while (time !== newTime);
  await page.reload();

  await page.waitForTimeout(1000);
  el = page.getByText("Time:");
  const midTime = await el.textContent();
  // Expect that the time is still stale
  expect(midTime).toEqual(newTime);

  // Wait 10 + 1 seconds for ISR to regenerate time
  await page.waitForTimeout(11000);
  let finalTime = newTime;
  do {
    await page.waitForTimeout(2000);
    el = page.getByText("Time:");
    finalTime = await el.textContent();
    await page.reload();
  } while (newTime === finalTime);

  expect(newTime).not.toEqual(finalTime);
});

test("headers", async ({ page }) => {
  let responsePromise = page.waitForResponse((response) => {
    return response.status() === 200;
  });
  await page.goto("/isr");

  while (true) {
    const response = await responsePromise;
    const headers = response.headers();

    // this was set in middleware
    if (headers["cache-control"] === "max-age=10, stale-while-revalidate=999") {
      break;
    }
    await page.waitForTimeout(1000);
    responsePromise = page.waitForResponse((response) => {
      return response.status() === 200;
    });
    await page.reload();
  }
});

test("Incremental Static Regeneration with data cache", async ({ page }) => {
  test.setTimeout(45000);
  await page.goto("/isr-data-cache");

  const originalFetchedDate = await page
    .getByTestId("fetched-date")
    .textContent();
  const originalCachedDate = await page
    .getByTestId("cached-date")
    .textContent();
  const originalTime = await page.getByTestId("time").textContent();
  await page.reload();

  let finalTime = originalTime;
  let finalCachedDate = originalCachedDate;
  let finalFetchedDate = originalFetchedDate;

  // Wait 10 + 1 seconds for ISR to regenerate time
  await page.waitForTimeout(11000);
  do {
    await page.waitForTimeout(2000);
    finalTime = await page.getByTestId("time").textContent();
    finalCachedDate = await page.getByTestId("cached-date").textContent();
    finalFetchedDate = await page.getByTestId("fetched-date").textContent();
    await page.reload();
  } while (originalTime === finalTime);

  expect(originalTime).not.toEqual(finalTime);
  expect(originalCachedDate).toEqual(finalCachedDate);
  expect(originalFetchedDate).toEqual(finalFetchedDate);
});

test("dynamicParams set to true", async ({ page }) => {
  const res = await page.goto("/isr/dynamic-params-true/1");
  expect(res?.status()).toEqual(200);
  expect(res?.headers()["x-nextjs-cache"]).toEqual("HIT");
  const title = await page.getByTestId("title").textContent();
  const content = await page.getByTestId("content").textContent();
  expect(title).toEqual("Post 1");
  expect(content).toEqual("This is post 1");

  // should SSR for a path that has not been generated
  const res2 = await page.goto("/isr/dynamic-params-true/11");
  expect(res2?.headers()["x-nextjs-cache"]).toEqual("MISS");
  const title2 = await page.getByTestId("title").textContent();
  const content2 = await page.getByTestId("content").textContent();
  expect(title2).toEqual("Post 11");
  expect(content2).toEqual("This is post 11");

  // should 500 for a non-existing path
  const res3 = await page.goto("/isr/dynamic-params-true/21");
  expect(res3?.status()).toEqual(500);
  expect(res3?.headers()["cache-control"]).toBe(
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
});

test("dynamicParams set to false", async ({ page }) => {
  // should return 200 and x-nextjs-cache HIT for an existing path
  const res = await page.goto("/isr/dynamic-params-false/1");
  expect(res?.status()).toEqual(200);
  expect(res?.headers()["x-nextjs-cache"]).toEqual("HIT");
  const title = await page.getByTestId("title").textContent();
  const content = await page.getByTestId("content").textContent();
  expect(title).toEqual("Post 1");
  expect(content).toEqual("This is post 1");

  // should return 404 for a non-existing path
  const res2 = await page.goto("/isr/dynamic-params-false/11");
  expect(res2?.status()).toEqual(404);
  expect(res2?.headers()["cache-control"]).toBe(
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  await expect(await page.getByText("404")).toBeAttached();
});
