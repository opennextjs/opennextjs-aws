import { expect, test } from "@playwright/test";

/**
 * Tests that query params are available in middleware and RSC
 */
test("SearchQuery", async ({ page }) => {
  await page.goto("/search-query?searchParams=e2etest&multi=one&multi=two");

  const propsEl = page.getByText("Search Params via Props: e2etest");
  const mwEl = page.getByText("Search Params via Middleware: mw/e2etest");
  const multiEl = page.getByText("Multi-value Params (key: multi): 2");
  const multiOne = page.getByText("one", { exact: true });
  const multiTwo = page.getByText("two", { exact: true });
  await expect(propsEl).toBeVisible();
  await expect(mwEl).toBeVisible();
  await expect(multiEl).toBeVisible();
  await expect(multiOne).toBeVisible();
  await expect(multiTwo).toBeVisible();
});

// Next.js renders its decoded query representation back into the App Router state.
// https://github.com/vercel/next.js/blob/3439bde/packages/next/src/shared/lib/router/utils/querystring.ts#L3-L31
test("preserves encoded query values during SSR and hydration", async ({
  page,
  request,
}) => {
  const path =
    "/search-query?brand=I%26C+SCI&brand=h%26m&hash=%23sinners&plus=%2B&percent=by%252Eclara&equals=a%3Db&redirect=https%3A%2F%2Fexample.com%2Fcallback%3Fnext%3D%252Faccount%26token%3Da%252Bb%2526c";
  const expected = {
    brand: ["I&C SCI", "h&m"],
    hash: ["#sinners"],
    plus: ["+"],
    percent: ["by%2Eclara"],
    equals: ["a=b"],
    redirect: ["https://example.com/callback?next=%2Faccount&token=a%2Bb%26c"],
  };

  const serverResponse = await request.get(path);
  expect(serverResponse.ok()).toBe(true);
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain("I&amp;C SCI");
  expect(serverHtml).toContain("h&amp;m");
  expect(serverHtml).toContain("by%2Eclara");
  expect(serverHtml).toContain(
    "https://example.com/callback?next=%2Faccount&amp;token=a%2Bb%26c",
  );

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error #418/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration|Minified React error #418/i.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await page.goto(path);
  const clientSearchParams = page.getByTestId("client-search-params");
  await expect(clientSearchParams).toHaveText(JSON.stringify(expected));
  await clientSearchParams.click();
  await expect(clientSearchParams).toHaveAttribute("data-hydrated", "true");
  expect(hydrationErrors).toEqual([]);
});

// Next.js preserves decoded source query values while applying a rewrite.
// https://github.com/vercel/next.js/blob/3439bde/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L221-L299
test("preserves encoded query values through rewrites", async ({
  page,
  request,
}) => {
  const path = "/search-query-rewrite?path=hello%252Fworld&path=a%252Fb%253Dc";
  const expected = {
    path: ["hello%2Fworld", "a%2Fb%3Dc"],
  };

  const serverResponse = await request.get(path);
  expect(serverResponse.ok()).toBe(true);
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain("hello%2Fworld");
  expect(serverHtml).toContain("a%2Fb%3Dc");

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error #418/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration|Minified React error #418/i.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await page.goto(path);
  const clientSearchParams = page.getByTestId("client-search-params");
  await expect(clientSearchParams).toHaveText(JSON.stringify(expected));
  await clientSearchParams.click();
  await expect(clientSearchParams).toHaveAttribute("data-hydrated", "true");
  expect(hydrationErrors).toEqual([]);
});

// Next.js parses destination queries into decoded server search parameters.
// https://github.com/vercel/next.js/blob/3439bde/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L221-L299
test("decodes destination query values once", async ({ page, request }) => {
  const path = "/search-query-destination-rewrite";
  const expected = {
    destination: ["hello%2Fworld", "a=b"],
    plus: "+",
    bare: "",
  };

  const serverResponse = await request.get(path);
  expect(serverResponse.ok()).toBe(true);
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain("hello%2Fworld");
  expect(serverHtml).toContain("a=b");

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error #418/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration|Minified React error #418/i.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await page.goto(path);
  await expect(page.getByTestId("server-search-params")).toHaveText(
    JSON.stringify(expected),
  );
  const clientSearchParams = page.getByTestId("client-search-params");
  await expect(clientSearchParams).toHaveText("{}");
  await clientSearchParams.click();
  await expect(clientSearchParams).toHaveAttribute("data-hydrated", "true");
  expect(hydrationErrors).toEqual([]);
});
