import { expect, test } from "@playwright/test";

test.describe("route-scoped cache with interception configured", () => {
  test("keeps a cold canonical entry isolated from an encoded catch-all", async ({
    request,
  }) => {
    const alias = await request.get("/%63ache-victim/alias-first");
    expect(await alias.text()).toContain("mixed-root-catch-all");

    const canonical = await request.get("/cache-victim/alias-first");
    expect(await canonical.text()).toContain("mixed-specific-victim");

    // Change the CDN cache key without changing Next.js's pathname-based cache
    // key, forcing the request to the origin where the interceptor header is set.
    const repeated = await request.get(
      "/cache-victim/alias-first?interceptor=canonical",
    );
    expect(await repeated.text()).toContain("mixed-specific-victim");
    expect(repeated.headers()["x-opennext-cache"]).toBe("HIT");

    const repeatedAlias = await request.get(
      "/%63ache-victim/alias-first?interceptor=alias",
    );
    expect(await repeatedAlias.text()).toContain("mixed-root-catch-all");
    expect(repeatedAlias.headers()["x-opennext-cache"]).toBe("HIT");
  });

  test("keeps a warm canonical entry isolated from an encoded catch-all", async ({
    request,
  }) => {
    const canonicalBefore = await request.get("/cache-victim/canonical-first");
    expect(await canonicalBefore.text()).toContain("mixed-specific-victim");

    const alias = await request.get("/%63ache-victim/canonical-first");
    expect(await alias.text()).toContain("mixed-root-catch-all");

    // Bypass the warmed CDN response while looking up the same Next.js entry.
    const canonicalAfter = await request.get(
      "/cache-victim/canonical-first?interceptor=canonical",
    );
    expect(await canonicalAfter.text()).toContain("mixed-specific-victim");
    expect(await canonicalAfter.text()).not.toContain("mixed-root-catch-all");
    expect(canonicalAfter.headers()["x-opennext-cache"]).toBe("HIT");
  });
});
