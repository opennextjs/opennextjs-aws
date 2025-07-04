import { createCacheKey } from "@opennextjs/aws/utils/cache.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("createCacheKey", () => {
  const originalEnv = process.env;
  const originalGlobalThis = globalThis as any;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };

    // Mock globalThis.openNextConfig
    if (!globalThis.openNextConfig) {
      globalThis.openNextConfig = {
        dangerous: {},
      };
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.openNextConfig = originalGlobalThis.openNextConfig;
  });

  test("have a defined build id for non-data cache entries", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    const key = "test-key";

    const result = createCacheKey({ key, type: "cache" });

    expect(result.buildId).toBe("test-build-id");
  });

  test("have a defined build id for data cache when persistentDataCache is not enabled", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    globalThis.openNextConfig.dangerous.persistentDataCache = false;
    const key = "test-key";

    const result = createCacheKey({ key, type: "fetch" });

    expect(result.buildId).toBe("test-build-id");
  });

  test("does not prepend build ID for data cache when persistentDataCache is enabled", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    globalThis.openNextConfig.dangerous.persistentDataCache = true;
    const key = "test-key";

    const result = createCacheKey({ key, type: "fetch" });

    expect(result.buildId).toBeUndefined();
  });

  test("handles missing build ID", () => {
    process.env.NEXT_BUILD_ID = undefined;
    const key = "test-key";

    const result = createCacheKey({ key, type: "fetch" });

    expect(result.buildId).toBeUndefined();
  });
});
