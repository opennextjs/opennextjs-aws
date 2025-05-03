import { expect, test } from "@playwright/test";

test.describe("Middleware Cookies", () => {
  test("should be able to set cookies on response in middleware", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    const cookies = await context.cookies();
    const from = cookies.find(({ name }) => name === "from");
    expect(from?.value).toEqual("middleware");

    const love = cookies.find(({ name }) => name === "with");
    expect(love?.value).toEqual("love");
  });
  test("should be able to get cookies set in the middleware with Next's cookies().get()", async ({
    page,
  }) => {
    await page.goto("/cookies");

    expect(await page.getByTestId("foo").textContent()).toBe("bar");
  });
});
