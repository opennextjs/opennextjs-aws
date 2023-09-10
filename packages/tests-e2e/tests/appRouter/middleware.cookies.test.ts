import { expect, test } from "@playwright/test";

test("Cookies", async ({ page, context }) => {
  await page.goto("/");

  const cookies = await context.cookies();
  const from = cookies.find(({ name }) => name === "from");
  expect(from?.value).toEqual("middleware");

  const love = cookies.find(({ name }) => name === "with");
  expect(love?.value).toEqual("love");
});
