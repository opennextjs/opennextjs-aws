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
    test.setTimeout(45000);
    const path = `/use-cache/on-demand/${Date.now()}`;

    const initialResponse = await page.goto(path);
    expect(initialResponse?.status()).toEqual(200);
    const taggedComponent = page.getByTestId("fully-cached-with-tag");
    await expect(taggedComponent).toBeVisible();
    const initialText = await taggedComponent.textContent();

    const response = await request.get("/api/revalidate");
    expect(response.status()).toEqual(200);
    expect(await response.text()).toEqual("DONE");

    let refreshedResponse = initialResponse;
    let refreshedText = initialText;
    for (
      let attempt = 0;
      attempt < 10 && refreshedText === initialText;
      attempt++
    ) {
      await page.waitForTimeout(1000);
      refreshedResponse = await page.goto(path);
      refreshedText = await taggedComponent.textContent();
    }

    expect(refreshedText).not.toEqual(initialText);
    const cacheHeader =
      refreshedResponse?.headers()["x-nextjs-cache"] ??
      refreshedResponse?.headers()["x-opennext-cache"];
    expect(cacheHeader).toEqual("MISS");
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
