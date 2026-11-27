import { expect, test } from "@playwright/test";

test.describe("data request pathname normalization", () => {
  let buildId: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const match = /"buildId":"([^"]+)"/.exec(html);
    expect(match).not.toBeNull();
    buildId = match![1];
  });

  test("serves a canonical data request through middleware", async ({
    request,
  }) => {
    const response = await request.get(`/_next/data/${buildId}/en.json`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["x-from-middleware"]).toBe("true");
    expect(await response.json()).toEqual({
      pageProps: { subpage: [], pageType: "home" },
      __N_SSG: true,
    });
  });

  // These are not dot segments on the wire. Removing `.json` turns them
  // into `.` or `..`, resolving to the home page matched by middleware.
  for (const path of [
    "en/..json",
    "en/%2e.json",
    "en/child/...json",
    "en/child/%2e%2e.json",
    "en/child/%2E%2E.json",
    "en/child/.%2e.json",
  ]) {
    test(`rejects a data request whose page pathname changes: ${path}`, async ({
      request,
    }) => {
      const response = await request.get(`/_next/data/${buildId}/${path}`, {
        maxRedirects: 0,
      });

      expect(response.status()).toBe(404);
      expect(response.headers().location).toBeUndefined();
      expect(response.headers()["cache-control"]).toContain("no-store");
    });
  }
});
