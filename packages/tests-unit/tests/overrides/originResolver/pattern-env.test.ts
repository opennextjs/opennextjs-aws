import { vi } from "vitest";

const ORIGINS = {
  default: { host: "default.example.com", protocol: "https" },
  api: { host: "api.example.com", protocol: "https" },
  images: { host: "images.example.com", protocol: "https" },
};

async function loadResolver(functions: Record<string, { patterns: string[] }>) {
  // The resolver caches compiled patterns at module level, so reload it per test.
  vi.resetModules();
  vi.stubEnv("OPEN_NEXT_ORIGIN", JSON.stringify(ORIGINS));
  globalThis.openNextConfig = { functions };
  return (
    await import("@opennextjs/aws/overrides/originResolver/pattern-env.js")
  ).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("originResolver/pattern-env", () => {
  it("should match after a prefix such as the basePath", async () => {
    const resolver = await loadResolver({ api: { patterns: ["api/*"] } });
    expect(await resolver.resolve("/docs/api/users")).toEqual(ORIGINS.api);
  });

  it("should match nested paths", async () => {
    const resolver = await loadResolver({ images: { patterns: ["*.png"] } });
    expect(await resolver.resolve("/img/logo.png")).toEqual(ORIGINS.images);
  });

  it("should match regex metacharacters in a pattern literally", async () => {
    const resolver = await loadResolver({
      images: { patterns: ["*.png"] },
      api: { patterns: ["a+b/*"] },
    });
    expect(await resolver.resolve("/logoXpng")).toEqual(ORIGINS.default);
    expect(await resolver.resolve("/a+b/x")).toEqual(ORIGINS.api);
    expect(await resolver.resolve("/aab/x")).toEqual(ORIGINS.default);
  });

  it("should match an empty remainder with '**'", async () => {
    const resolver = await loadResolver({ api: { patterns: ["api/**"] } });
    expect(await resolver.resolve("/api/")).toEqual(ORIGINS.api);
  });
});
