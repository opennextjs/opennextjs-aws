import { expect, test } from "@playwright/test";
import { validateMd5 } from "../utils";

const EXT_PNG_MD5 = "405f45cc3397b09717a13ebd6f1e027b";

test.describe("Rewrite", () => {
  test("Single Rewrite", async ({ page }) => {
    await page.goto("/rewrite");

    const el = page.getByText("Nextjs Pages Router");
    await expect(el).toBeVisible();
  });

  test("Rewrite with query", async ({ page }) => {
    await page.goto("/rewriteUsingQuery?d=ssr");

    const el = page.getByText("SSR");
    await expect(el).toBeVisible();
  });

  test("Rewrite to external image", async ({ request }) => {
    const response = await request.get("/external-on-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(validateMd5(await response.body(), EXT_PNG_MD5)).toBe(true);
  });

  test("Rewrite with query in destination", async ({ request }) => {
    const response = await request.get("/rewriteWithQuery");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ query: { q: "1" } });
  });

  test("Rewrite with query should merge query params", async ({ request }) => {
    const response = await request.get("/rewriteWithQuery?b=2");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ query: { q: "1", b: "2" } });
  });

  test("[routing parity] compiles an empty optional catch-all", async ({
    page,
  }) => {
    await page.goto("/condition-catchall/");

    await expect(page.getByText("Nextjs Pages Router")).toBeVisible();
  });

  test("[routing parity] requires present monitoring parameters", async ({
    request,
  }) => {
    const absent = await request.get("/monitoring-tunnel/");
    expect(absent.status()).toBe(404);

    const missingProject = await request.get("/monitoring-tunnel/?o=123");
    expect(missingProject.status()).toBe(404);

    const missingOrganization = await request.get("/monitoring-tunnel/?p=456");
    expect(missingOrganization.status()).toBe(404);

    const present = await request.get("/monitoring-tunnel/?o=123&p=456");
    expect(present.status()).toBe(200);
    expect(await present.json()).toEqual({
      query: {
        o: "123",
        p: "456",
        organizationId: "123",
        projectId: "456",
      },
    });
  });

  test("[routing parity] preserves repeated-query semantics", async ({
    request,
  }) => {
    const patterned = await request.get(
      "/condition-repeated/?items=one&items=two",
    );
    expect(patterned.status()).toBe(200);
    expect(await patterned.json()).toEqual({
      query: { items: ["one", "two"], selected: "two" },
    });

    const finalEmpty = await request.get(
      "/condition-repeated/?items=one&items=",
    );
    expect(finalEmpty.status()).toBe(200);
    expect(await finalEmpty.json()).toEqual({
      query: { items: ["one", ""], selected: "" },
    });

    const valueLess = await request.get(
      "/condition-value-less/?items=one&items=two",
    );
    expect(valueLess.status()).toBe(200);
    expect(await valueLess.json()).toEqual({
      query: { items: ["one", "two"], selected: "one/two" },
    });
  });

  test("[routing parity] captures hosts and excludes missing captures", async ({
    request,
    baseURL,
  }) => {
    const host = await request.get("/condition-host/");
    expect(host.status()).toBe(200);
    expect(await host.json()).toEqual({
      slug: new URL(baseURL ?? "").hostname.toLowerCase(),
    });

    const missing = await request.get("/condition-missing/from-source/");
    expect(missing.status()).toBe(200);
    expect(await missing.json()).toEqual({ slug: "from-source" });

    const blocked = await request.get(
      "/condition-missing/from-source/?blocked=true",
    );
    expect(blocked.status()).toBe(404);
  });
});
