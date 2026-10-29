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
  test("should split the compound cookies of a direct middleware response", async ({
    page,
    context,
  }) => {
    // Next folds the cookies set through `cookies()` into a single comma-joined
    // `set-cookie` header, they have to be split back for the browser to accept them.
    await page.goto("/redirect");
    await page.waitForURL("/redirect-destination");

    const cookies = await context.cookies();
    const first = cookies.find(({ name }) => name === "test");
    expect(first?.value).toEqual("success");

    const second = cookies.find(({ name }) => name === "test2");
    expect(second?.value).toEqual("success2");
  });
  test("should not expose internal Next headers in response", async ({
    page,
    context,
  }) => {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("/cookies"),
    );

    await page.goto("/cookies");

    const response = await responsePromise;
    const headers = response.headers();

    const cookies = await context.cookies();
    const fooCookie = cookies.find(({ name }) => name === "foo");
    expect(fooCookie?.value).toBe("bar");

    expect(headers).not.toHaveProperty("x-middleware-set-cookie");
    expect(headers).not.toHaveProperty("x-middleware-next");
  });
});
