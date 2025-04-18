import { expect, test } from "@playwright/test";

test("cached component should work in ssr", async ({ page }) => {
  await page.goto("/use-cache/ssr");
  let fullyCachedElt = page.getByTestId("fullyCached");
  let isrElt = page.getByTestId("isr");
  await expect(fullyCachedElt).toBeVisible();
  await expect(isrElt).toBeVisible();

  const initialFullyCachedText = await fullyCachedElt.textContent();
  const initialIsrText = await isrElt.textContent();

  let isrText = initialIsrText;

  do {
    await page.reload();
    fullyCachedElt = page.getByTestId("fullyCached");
    isrElt = page.getByTestId("isr");
    await expect(fullyCachedElt).toBeVisible();
    await expect(isrElt).toBeVisible();
    isrText = await isrElt.textContent();
    await page.waitForTimeout(1000);
  } while (isrText === initialIsrText);

  expect(fullyCachedElt).toHaveText(initialFullyCachedText ?? "");
  expect(isrElt).not.toHaveText(initialIsrText ?? "");
});

test("revalidateTag should work for fullyCached component", async ({
  page,
  request,
}) => {
  await page.goto("/use-cache/ssr");
  const fullyCachedElt = page.getByTestId("fullyCached");
  await expect(fullyCachedElt).toBeVisible();

  const initialFullyCachedText = await fullyCachedElt.textContent();

  const resp = await request.get("/api/revalidate");
  expect(resp.status()).toEqual(200);
  expect(await resp.text()).toEqual("DONE");

  await page.reload();
  await expect(fullyCachedElt).toBeVisible();
  expect(fullyCachedElt).not.toHaveText(initialFullyCachedText ?? "");
});
