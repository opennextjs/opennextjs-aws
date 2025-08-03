import ComposableCache from "@opennextjs/aws/adapters/composable-cache";
import {
  fromReadableStream,
  toReadableStream,
} from "@opennextjs/aws/utils/stream";
import { vi } from "vitest";

describe("Composable cache handler", () => {
  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");

  const incrementalCache = {
    name: "mock",
    get: vi.fn().mockResolvedValue({
      value: {
        type: "route",
        body: "{}",
        tags: ["tag1", "tag2"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
        value: "test-value",
      },
      lastModified: Date.now(),
    }),
    set: vi.fn(),
    delete: vi.fn(),
  };
  globalThis.incrementalCache = incrementalCache;

  const tagCache = {
    name: "mock",
    mode: "original" as string | undefined,
    hasBeenRevalidated: vi.fn(),
    getByTag: vi.fn().mockResolvedValue(["path1", "path2"]),
    getByPath: vi.fn().mockResolvedValue(["tag1"]),
    getLastModified: vi
      .fn()
      .mockResolvedValue(new Date("2024-01-02T00:00:00Z").getTime()),
    getLastRevalidated: vi.fn().mockResolvedValue(0),
    writeTags: vi.fn(),
  };
  globalThis.tagCache = tagCache;

  const invalidateCdnHandler = {
    name: "mock",
    invalidatePaths: vi.fn(),
  };
  globalThis.cdnInvalidationHandler = invalidateCdnHandler;
  const writtenTags = new Set();

  globalThis.__openNextAls = {
    getStore: () => ({
      pendingPromiseRunner: {
        withResolvers: vi.fn().mockReturnValue({
          resolve: vi.fn(),
        }),
      },
      writtenTags,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    globalThis.openNextConfig = {
      dangerous: {
        disableIncrementalCache: false,
        disableTagCache: false,
      },
    };
  });

  describe("get", () => {
    it("should return cached entry when available and not revalidated", async () => {
      const result = await ComposableCache.get("test-key");

      expect(incrementalCache.get).toHaveBeenCalledWith(
        "test-key",
        "composable",
      );
      expect(result).toBeDefined();
      expect(result?.tags).toEqual(["tag1", "tag2"]);
      expect(result?.value).toBeInstanceOf(ReadableStream);
    });

    it("should return undefined when cache entry does not exist", async () => {
      incrementalCache.get.mockResolvedValueOnce(null);

      const result = await ComposableCache.get("non-existent-key");

      expect(result).toBeUndefined();
    });

    it("should return undefined when cache entry has no value", async () => {
      incrementalCache.get.mockResolvedValueOnce({
        value: null,
        lastModified: Date.now(),
      });

      const result = await ComposableCache.get("test-key");

      expect(result).toBeUndefined();
    });

    it("should check tag revalidation in nextMode", async () => {
      tagCache.mode = "nextMode";
      tagCache.hasBeenRevalidated.mockResolvedValueOnce(false);

      const result = await ComposableCache.get("test-key");

      expect(tagCache.hasBeenRevalidated).toHaveBeenCalledWith(
        ["tag1", "tag2"],
        expect.any(Number),
      );
      expect(result).toBeDefined();
    });

    it("should return undefined when tags have been revalidated in nextMode", async () => {
      tagCache.mode = "nextMode";
      tagCache.hasBeenRevalidated.mockResolvedValueOnce(true);

      const result = await ComposableCache.get("test-key");

      expect(result).toBeUndefined();
    });

    it("should skip tag check when tags array is empty in nextMode", async () => {
      tagCache.mode = "nextMode";
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "route",
          body: "{}",
          tags: [],
          value: "test-value",
        },
        lastModified: Date.now(),
      });

      const result = await ComposableCache.get("test-key");

      expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should check last modified in original mode", async () => {
      tagCache.mode = "original";
      tagCache.getLastModified.mockResolvedValueOnce(Date.now());

      const result = await ComposableCache.get("test-key");

      expect(tagCache.getLastModified).toHaveBeenCalledWith(
        "test-key",
        expect.any(Number),
      );
      expect(result).toBeDefined();
    });

    it("should return undefined when entry has been revalidated in original mode", async () => {
      tagCache.mode = "original";
      tagCache.getLastModified.mockResolvedValueOnce(-1);

      const result = await ComposableCache.get("test-key");

      expect(result).toBeUndefined();
    });

    it("should handle undefined tag cache mode", async () => {
      tagCache.mode = undefined;
      tagCache.getLastModified.mockResolvedValueOnce(Date.now());

      const result = await ComposableCache.get("test-key");

      expect(tagCache.getLastModified).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should return undefined on cache read error", async () => {
      incrementalCache.get.mockRejectedValueOnce(new Error("Cache error"));

      const result = await ComposableCache.get("test-key");

      expect(result).toBeUndefined();
    });

    it("should return pending write promise if available", async () => {
      const pendingEntry = Promise.resolve({
        value: toReadableStream("pending-value"),
        tags: ["tag1"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      });

      // Start a set operation to create a pending write
      const setPromise = ComposableCache.set("pending-key", pendingEntry);

      // Try to get the same key while set is in progress
      const result = await ComposableCache.get("pending-key");

      expect(result).toBeDefined();
      expect(result?.value).toBeInstanceOf(ReadableStream);

      // Wait for set to complete
      await setPromise;
    });
  });

  describe("set", () => {
    beforeEach(() => {
      writtenTags.clear();
    });

    it("should set cache entry and handle tags in original mode", async () => {
      tagCache.mode = "original";
      const entry = {
        value: toReadableStream("test-value"),
        tags: ["tag1", "tag2"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("test-key", Promise.resolve(entry));

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "test-key",
        expect.objectContaining({
          tags: ["tag1", "tag2"],
          value: "test-value",
        }),
        "composable",
      );
      expect(tagCache.getByPath).toHaveBeenCalledWith("test-key");
    });

    it("should write new tags not already stored", async () => {
      tagCache.mode = "original";
      tagCache.getByPath.mockResolvedValueOnce(["tag1"]);

      const entry = {
        value: toReadableStream("test-value"),
        tags: ["tag1", "tag2", "tag3"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("test-key", Promise.resolve(entry));

      expect(tagCache.writeTags).toHaveBeenCalledWith([
        { tag: "tag2", path: "test-key" },
        { tag: "tag3", path: "test-key" },
      ]);
    });

    it("should not write tags if all are already stored", async () => {
      tagCache.mode = "original";
      tagCache.getByPath.mockResolvedValueOnce(["tag1", "tag2"]);

      const entry = {
        value: toReadableStream("test-value"),
        tags: ["tag1", "tag2"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("test-key", Promise.resolve(entry));

      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });

    it("should skip tag handling in nextMode", async () => {
      tagCache.mode = "nextMode";

      const entry = {
        value: toReadableStream("test-value"),
        tags: ["tag1", "tag2"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("test-key", Promise.resolve(entry));

      expect(tagCache.getByPath).not.toHaveBeenCalled();
      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });

    it("should convert ReadableStream to string", async () => {
      const entry = {
        value: toReadableStream("test-content"),
        tags: ["tag1"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("test-key", Promise.resolve(entry));

      expect(incrementalCache.set).toHaveBeenCalledWith(
        "test-key",
        expect.objectContaining({
          value: "test-content",
        }),
        "composable",
      );
    });
  });

  describe("refreshTags", () => {
    it("should do nothing", async () => {
      await ComposableCache.refreshTags();

      // Should not call any methods
      expect(incrementalCache.get).not.toHaveBeenCalled();
      expect(incrementalCache.set).not.toHaveBeenCalled();
      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });
  });

  describe("getExpiration", () => {
    it("should return last revalidated time in nextMode", async () => {
      tagCache.mode = "nextMode";
      tagCache.getLastRevalidated.mockResolvedValueOnce(123456);

      const result = await ComposableCache.getExpiration("tag1", "tag2");

      expect(tagCache.getLastRevalidated).toHaveBeenCalledWith([
        "tag1",
        "tag2",
      ]);
      expect(result).toBe(123456);
    });

    it("should return 0 in original mode", async () => {
      tagCache.mode = "original";

      const result = await ComposableCache.getExpiration("tag1", "tag2");

      expect(result).toBe(0);
    });

    it("should return 0 when mode is undefined", async () => {
      tagCache.mode = undefined;

      const result = await ComposableCache.getExpiration("tag1", "tag2");

      expect(result).toBe(0);
    });
  });

  describe("expireTags", () => {
    beforeEach(() => {
      writtenTags.clear();
    });
    it("should write tags directly in nextMode", async () => {
      tagCache.mode = "nextMode";

      await ComposableCache.expireTags("tag1", "tag2");

      expect(tagCache.writeTags).toHaveBeenCalledWith(["tag1", "tag2"]);
    });

    it("should find paths and write tag mappings in original mode", async () => {
      tagCache.mode = "original";
      tagCache.getByTag.mockImplementation(async (tag) => {
        if (tag === "tag1") return ["path1", "path2"];
        if (tag === "tag2") return ["path2", "path3"];
        return [];
      });

      await ComposableCache.expireTags("tag1", "tag2");

      expect(tagCache.getByTag).toHaveBeenCalledWith("tag1");
      expect(tagCache.getByTag).toHaveBeenCalledWith("tag2");
      expect(tagCache.writeTags).toHaveBeenCalledWith(
        expect.arrayContaining([
          { path: "path1", tag: "tag1", revalidatedAt: expect.any(Number) },
          { path: "path2", tag: "tag1", revalidatedAt: expect.any(Number) },
          { path: "path2", tag: "tag2", revalidatedAt: expect.any(Number) },
          { path: "path3", tag: "tag2", revalidatedAt: expect.any(Number) },
        ]),
      );
    });

    it("should deduplicate paths in original mode", async () => {
      tagCache.mode = "original";
      tagCache.getByTag.mockImplementation(async (tag) => {
        if (tag === "tag1") return ["path1", "path2"];
        if (tag === "tag2") return ["path1", "path2"];
        return [];
      });

      await ComposableCache.expireTags("tag1", "tag2");

      const writtenTags = tagCache.writeTags.mock.calls[0][0];
      expect(writtenTags).toHaveLength(4); // 2 paths × 2 tags = 4 unique combinations
      expect(writtenTags).toEqual(
        expect.arrayContaining([
          { path: "path1", tag: "tag1", revalidatedAt: expect.any(Number) },
          { path: "path2", tag: "tag1", revalidatedAt: expect.any(Number) },
          { path: "path1", tag: "tag2", revalidatedAt: expect.any(Number) },
          { path: "path2", tag: "tag2", revalidatedAt: expect.any(Number) },
        ]),
      );
    });

    it("should handle empty paths in original mode", async () => {
      tagCache.mode = "original";
      tagCache.getByTag.mockResolvedValue([]);

      await ComposableCache.expireTags("tag1");

      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });
  });

  describe("receiveExpiredTags", () => {
    it("should do nothing", async () => {
      await ComposableCache.receiveExpiredTags("tag1", "tag2");

      // Should not call any methods
      expect(incrementalCache.get).not.toHaveBeenCalled();
      expect(incrementalCache.set).not.toHaveBeenCalled();
      expect(tagCache.writeTags).not.toHaveBeenCalled();
    });
  });

  describe("integration tests", () => {
    it("should handle complete cache lifecycle", async () => {
      // Set a cache entry
      const entry = {
        value: toReadableStream("integration-test"),
        tags: ["integration-tag"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      await ComposableCache.set("integration-key", Promise.resolve(entry));

      // Verify it was stored
      expect(incrementalCache.set).toHaveBeenCalledWith(
        "integration-key",
        expect.objectContaining({
          value: "integration-test",
          tags: ["integration-tag"],
        }),
        "composable",
      );

      // Mock the get response
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          ...entry,
          value: "integration-test",
        },
        lastModified: Date.now(),
      });

      // Get the cache entry
      const result = await ComposableCache.get("integration-key");

      expect(result).toBeDefined();
      expect(result?.tags).toEqual(["integration-tag"]);

      // Convert the stream back to verify content
      const content = await fromReadableStream(result!.value);
      expect(content).toBe("integration-test");
    });

    it("should handle concurrent get/set operations", async () => {
      const entry1 = {
        value: toReadableStream("concurrent-1"),
        tags: ["tag1"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      const entry2 = {
        value: toReadableStream("concurrent-2"),
        tags: ["tag2"],
        stale: 0,
        timestamp: Date.now(),
        expire: Date.now() + 1000,
        revalidate: 3600,
      };

      // Start multiple operations concurrently
      const promises = [
        ComposableCache.set("key1", Promise.resolve(entry1)),
        ComposableCache.set("key2", Promise.resolve(entry2)),
        ComposableCache.get("key1"),
        ComposableCache.get("key2"),
      ];

      const results = await Promise.all(promises);

      expect(incrementalCache.set).toHaveBeenCalledTimes(2);
      expect(incrementalCache.get).not.toHaveBeenCalled();

      expect(results[2]).toBeDefined();
      expect(results[3]).toBeDefined();

      const content1 = await fromReadableStream(results[2]!.value);
      expect(content1).toBe("concurrent-1");

      const content2 = await fromReadableStream(results[3]!.value);
      expect(content2).toBe("concurrent-2");
    });
  });
});
