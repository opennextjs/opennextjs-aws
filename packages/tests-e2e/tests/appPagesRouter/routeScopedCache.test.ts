import { expect, test } from "@playwright/test";

test.describe("route-scoped cache with interception configured", () => {
  test("keeps a cold canonical entry isolated from an encoded catch-all", async ({
    request,
  }) => {
    const alias = await request.get("/%63ache-victim/alias-first");
    expect(await alias.text()).toContain("mixed-root-catch-all");

    const canonical = await request.get("/cache-victim/alias-first");
    expect(await canonical.text()).toContain("mixed-specific-victim");

    const repeated = await request.get("/cache-victim/alias-first");
    expect(await repeated.text()).toContain("mixed-specific-victim");
  });

  test("keeps a warm canonical entry isolated from an encoded catch-all", async ({
    request,
  }) => {
    const canonicalBefore = await request.get("/cache-victim/canonical-first");
    expect(await canonicalBefore.text()).toContain("mixed-specific-victim");

    const alias = await request.get("/%63ache-victim/canonical-first");
    expect(await alias.text()).toContain("mixed-root-catch-all");

    const canonicalAfter = await request.get("/cache-victim/canonical-first");
    expect(await canonicalAfter.text()).toContain("mixed-specific-victim");
    expect(await canonicalAfter.text()).not.toContain("mixed-root-catch-all");
  });
});
