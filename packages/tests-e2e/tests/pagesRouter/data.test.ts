import { expect, test } from "@playwright/test";

test("fix _next/data", async ({ page }) => {
  await page.goto("/");

  const isrJson = page.waitForResponse("/_next/data/*/en/isr.json");
  const response = await isrJson;
  expect(response.ok()).toBe(true);
  expect(response.request().url()).toMatch(/\/_next\/data\/.*\/en\/isr\.json$/);

  await page.locator('[href="/isr/"]').click();
  await page.waitForURL("/isr/");

  const homeJson = page.waitForResponse("/_next/data/*/en.json");
  await page.locator('[href="/"]').click();
  const response2 = await homeJson;
  expect(response2.ok()).toBe(true);
  expect(response2.request().url()).toMatch(/\/_next\/data\/.*\/en\.json$/);
  await page.waitForURL("/");
  const body = await response2.json();
  expect(body).toEqual({
    pageProps: { subpage: [], pageType: "home" },
    __N_SSG: true,
  });
});

test("requires a separator after the data request build ID", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const match = /"buildId":"([^"]+)"/.exec(await home.text());
  expect(match).not.toBeNull();
  const buildId = match![1];

  const data = await request.get(`/_next/data/${buildId}/en.json`, {
    maxRedirects: 0,
  });
  expect(data.status()).toBe(200);
  expect(data.headers()["x-from-middleware"]).toBe("true");
  expect(await data.json()).toEqual({
    pageProps: { subpage: [], pageType: "home" },
    __N_SSG: true,
  });

  // Without the separator check, these become URL references that bypass
  // middleware instead of being rejected as invalid data requests.
  for (const path of ["http:x/en.json", "https:/en.json"]) {
    const response = await request.get(`/_next/data/${buildId}${path}`, {
      maxRedirects: 0,
    });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location, path).toBeUndefined();
  }
});
