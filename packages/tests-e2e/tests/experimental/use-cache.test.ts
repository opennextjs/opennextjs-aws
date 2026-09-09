import { expect, test } from "@playwright/test";

test.describe("Composable Cache", () => {
  test("cached component should work in ssr", async ({ page }) => {
    await page.goto("/use-cache/ssr");
    let fullyCachedElt = page.getByTestId("fully-cached");
    let isrElt = page.getByTestId("isr");
    await expect(fullyCachedElt).toBeVisible();
    await expect(isrElt).toBeVisible();

    const initialFullyCachedText = await fullyCachedElt.textContent();
    const initialIsrText = await isrElt.textContent();

    let isrText = initialIsrText;

    do {
      await page.reload();
      fullyCachedElt = page.getByTestId("fully-cached");
      isrElt = page.getByTestId("isr");
      await expect(fullyCachedElt).toBeVisible();
      await expect(isrElt).toBeVisible();
      isrText = await isrElt.textContent();
      await page.waitForTimeout(1000);
    } while (isrText === initialIsrText);
    const fullyCachedText = await fullyCachedElt.textContent();
    expect(fullyCachedText).toEqual(initialFullyCachedText);
  });

  test("revalidateTag should work for fullyCached component", async ({
    page,
    request,
  }) => {
    await page.goto("/use-cache/ssr");
    const fullyCachedElt = page.getByTestId("fully-cached-with-tag");
    await expect(fullyCachedElt).toBeVisible();

    const initialFullyCachedText = await fullyCachedElt.textContent();

    const resp = await request.get("/api/revalidate");
    expect(resp.status()).toEqual(200);
    expect(await resp.text()).toEqual("DONE");

    await page.reload();
    await expect(fullyCachedElt).toBeVisible();
    const newFullyCachedText = await fullyCachedElt.textContent();
    expect(newFullyCachedText).not.toEqual(initialFullyCachedText);
  });

  test("revalidateTag should invalidate an on-demand use cache page", async ({
    page,
    request,
  }) => {
    // Two bounded polling loops (warm-up then revalidation), so this needs more headroom
    // than the other tests in this file.
    test.setTimeout(90000);
    const path = `/use-cache/on-demand/${Date.now()}`;

    // The first request generates the page on demand, and the path/tag association is
    // written during that `set` - behind a detached promise, into an eventually consistent
    // store. Wait until the entry is actually served from the cache before revalidating,
    // otherwise `revalidateTag` may not see the association yet and would leave the page
    // untouched.
    let warmupCache: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const warmupResponse = await page.goto(path);
      expect(warmupResponse?.status()).toEqual(200);
      const warmupHeaders = warmupResponse?.headers() ?? {};
      warmupCache =
        warmupHeaders["x-nextjs-cache"] ?? warmupHeaders["x-opennext-cache"];
      if (warmupCache === "HIT" || warmupCache === "STALE") {
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(warmupCache).toMatch(/^(HIT|STALE)$/);

    const taggedComponent = page.getByTestId("fully-cached-with-tag");
    await expect(taggedComponent).toBeVisible();
    const initialText = await taggedComponent.textContent();

    const response = await request.get("/api/revalidate");
    expect(response.status()).toEqual(200);
    expect(await response.text()).toEqual("DONE");

    let refreshedResponse = await page.goto(path);
    let refreshedText = await taggedComponent.textContent();
    for (
      let attempt = 0;
      attempt < 10 && refreshedText === initialText;
      attempt++
    ) {
      await page.waitForTimeout(1000);
      refreshedResponse = await page.goto(path);
      refreshedText = await taggedComponent.textContent();
    }

    // `cacheTag` inside a `use cache` function propagates to the enclosing page entry, so
    // a changed value proves the page entry was invalidated and not just the inner
    // composable cache entry.
    expect(refreshedText).not.toEqual(initialText);
    const cacheHeader =
      refreshedResponse?.headers()["x-nextjs-cache"] ??
      refreshedResponse?.headers()["x-opennext-cache"];
    // `revalidateTag` expires the tag immediately, so the request that returns the new
    // content is normally a blocking MISS. If the revalidation marker lands late, an
    // earlier request may be served from cache and the new content then surfaces on a
    // later HIT.
    expect(cacheHeader).toMatch(/^(MISS|HIT)$/);
  });

  test("cached component should work in isr", async ({ page }) => {
    await page.goto("/use-cache/isr");

    let fullyCachedElt = page.getByTestId("fully-cached");
    let isrElt = page.getByTestId("isr");

    await expect(fullyCachedElt).toBeVisible();
    await expect(isrElt).toBeVisible();

    let initialFullyCachedText = await fullyCachedElt.textContent();
    let initialIsrText = await isrElt.textContent();

    // We have to force reload until ISR has triggered at least once, otherwise the test will be flakey

    let isrText = initialIsrText;

    while (isrText === initialIsrText) {
      await page.reload();
      isrElt = page.getByTestId("isr");
      fullyCachedElt = page.getByTestId("fully-cached");
      await expect(isrElt).toBeVisible();
      isrText = await isrElt.textContent();
      await expect(fullyCachedElt).toBeVisible();
      initialFullyCachedText = await fullyCachedElt.textContent();
      await page.waitForTimeout(1000);
    }
    initialIsrText = isrText;

    do {
      await page.reload();
      fullyCachedElt = page.getByTestId("fully-cached");
      isrElt = page.getByTestId("isr");
      await expect(fullyCachedElt).toBeVisible();
      await expect(isrElt).toBeVisible();
      isrText = await isrElt.textContent();
      await page.waitForTimeout(1000);
    } while (isrText === initialIsrText);
    const fullyCachedText = await fullyCachedElt.textContent();
    expect(fullyCachedText).toEqual(initialFullyCachedText);
  });
});
