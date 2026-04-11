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
  const time = await elLayout.textContent();
  let newTime: typeof time;

  let response = await responsePromise;
  const headers = response.headers();
  const nextCacheHeader =
    headers["x-nextjs-cache"] ?? headers["x-opennext-cache"];
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
  const headersNested = response.headers();
  const nextCacheHeaderNested =
    headersNested["x-nextjs-cache"] ?? headersNested["x-opennext-cache"];
  expect(nextCacheHeaderNested).toEqual("HIT");
});

test("Revalidate tag - stale data served first", async ({ page, request }) => {
  test.setTimeout(45000);

  // Warm up: visit several times so the page is firmly cached (HIT)
  for (let i = 0; i < 3; i++) {
    await page.goto("/revalidate-tag/stale");
    await page.waitForSelector("[data-testid='cached-time']");
  }

  let responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/revalidate-tag/stale") &&
      response.status() === 200,
  );
  await page.goto("/revalidate-tag/stale");
  const warmupResponse = await responsePromise;
  const warmupHeaders = warmupResponse.headers();
  const warmupCache =
    warmupHeaders["x-nextjs-cache"] ?? warmupHeaders["x-opennext-cache"];
  // Must be cached after warm-up
  expect(warmupCache).toMatch(/^(HIT|STALE)$/);

  // Record the currently cached value
  const cachedTimeEl = page.getByTestId("cached-time");
  const originalTime = await cachedTimeEl.textContent();

  // Trigger revalidateTag WITHOUT expire — marks the tag stale but does NOT
  // immediately purge the cache; the next request should get STALE data.
  const revalidateRes = await request.get("/api/revalidate-tag-stale");
  expect(revalidateRes.status()).toEqual(200);
  expect(await revalidateRes.text()).toEqual("ok");

  // First request after revalidation — expect STALE header and OLD content
  responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/revalidate-tag/stale") &&
      response.status() === 200,
  );
  await page.goto("/revalidate-tag/stale");
  const staleResponse = await responsePromise;
  const staleHeaders = staleResponse.headers();
  const staleCache =
    staleHeaders["x-nextjs-cache"] ?? staleHeaders["x-opennext-cache"];
  expect(staleCache).toMatch(/^(STALE)$/);

  const staleTime = await page.getByTestId("cached-time").textContent();
  // Stale content must match the pre-revalidation value
  expect(staleTime).toEqual(originalTime);

  // Wait for the background regeneration to finish, then verify fresh data
  let freshTime: string | null = null;
  let attempts = 0;
  while (attempts < 10) {
    await page.waitForTimeout(2000);
    await page.goto("/revalidate-tag/stale");

    freshTime = await page.getByTestId("cached-time").textContent();
    if (freshTime !== originalTime) {
      break;
    }

    attempts++;
  }

  // After background regen the cached value must have been updated
  expect(freshTime).not.toBeNull();
  expect(freshTime).not.toEqual(originalTime);

  // Now we want to verfiy that the next entries stays fresh (HIT) after the first stale entry
	responsePromise = page.waitForResponse(
		(response) => response.url().includes("/revalidate-tag/stale") && response.status() === 200
	);
	await page.goto("/revalidate-tag/stale");
	const finalResponse = await responsePromise;
	const finalHeaders = finalResponse.headers();
	const finalCache = finalHeaders["x-nextjs-cache"] ?? finalHeaders["x-opennext-cache"];
	expect(finalCache).toEqual("HIT");

	const finalTime = await page.getByTestId("cached-time").textContent();
	expect(finalTime).toEqual(freshTime);
});

test("Revalidate path", async ({ page, request }) => {
  await page.goto("/revalidate-path");

  let elLayout = page.getByText("RequestID:");
  const initialReqId = await elLayout.textContent();

  elLayout = page.getByText("Date:");
  const initialDate = await elLayout.textContent();

  // Wait so that enough time passes for the data on the page to update when revalidating
  await page.waitForTimeout(2000);

  // Send revalidate path request
  const result = await request.get("/api/revalidate-path");
  expect(result.status()).toEqual(200);
  const text = await result.text();
  expect(text).toEqual("ok");

  await page.goto("/revalidate-path");
  elLayout = page.getByText("RequestID:");
  const newReqId = await elLayout.textContent();
  expect(newReqId).not.toEqual(initialReqId);

  elLayout = page.getByText("Date:");
  const newDate = await elLayout.textContent();
  expect(newDate).not.toEqual(initialDate);
});
