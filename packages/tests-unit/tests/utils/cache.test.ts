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

  test("prepends build ID for non-data cache entries", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    const key = "test-key";

    const result = createCacheKey(key, false);

    expect(result).toBe("test-build-id/test-key");
  });

  test("prepends build ID for data cache when persistentDataCache is not enabled", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    globalThis.openNextConfig.dangerous.persistentDataCache = false;
    const key = "test-key";

    const result = createCacheKey(key, true);

    expect(result).toBe("test-build-id/test-key");
  });

  test("does not prepend build ID for data cache when persistentDataCache is enabled", () => {
    process.env.NEXT_BUILD_ID = "test-build-id";
    globalThis.openNextConfig.dangerous.persistentDataCache = true;
    const key = "test-key";

    const result = createCacheKey(key, true);

    expect(result).toBe("test-key");
  });

  test("handles missing build ID", () => {
    process.env.NEXT_BUILD_ID = undefined;
    const key = "test-key";

    const result = createCacheKey(key, false);

    expect(result).toBe("test-key");
  });
});
