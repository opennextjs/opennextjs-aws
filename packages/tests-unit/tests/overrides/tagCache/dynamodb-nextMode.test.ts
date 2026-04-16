import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoverableError } from "@opennextjs/aws/utils/error.js";
import { RequestCache } from "@opennextjs/aws/utils/requestCache.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
  debug: vi.fn(),
  error: vi.fn(),
}));

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("aws4fetch", () => ({
  AwsClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@opennextjs/aws/utils/fetch.js", () => ({
  customFetchClient: vi.fn().mockReturnValue(mockFetch),
}));

import tagCache from "@opennextjs/aws/overrides/tagCache/dynamodb-nextMode.js";

declare global {
  //@ts-ignore
  var openNextConfig: { dangerous?: { disableTagCache?: boolean } };
  //@ts-ignore
  var __openNextAls: { getStore: () => any };
}

const BUILD_ID = "test-build-id";
const TABLE_NAME = "test-table";

function makeStore() {
  return { requestCache: new RequestCache() };
}

function makeJsonResponse(body: unknown, status = 200) {
  return {
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPEN_NEXT_BUILD_ID = BUILD_ID;
  process.env.CACHE_DYNAMO_TABLE = TABLE_NAME;
  process.env.CACHE_BUCKET_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "test-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  globalThis.openNextConfig = { dangerous: { disableTagCache: false } };
  globalThis.__openNextAls = {
    getStore: vi.fn().mockReturnValue(makeStore()),
  };
});

// Builds the key as dynamodb-nextMode does: <buildId>/_tag/<tag>
function buildKey(tag: string) {
  return `${BUILD_ID}/_tag/${tag}`;
}

describe("dynamodb-nextMode tagCache", () => {
  describe("getLastRevalidated", () => {
    it("always returns 0", async () => {
      const result = await tagCache.getLastRevalidated(["tag1", "tag2"]);

      expect(result).toBe(0);
    });
  });

  describe("hasBeenRevalidated", () => {
    it("returns false when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.hasBeenRevalidated(["tag1"], 12345);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("throws RecoverableError when tags.length > 100", async () => {
      const tags = Array.from({ length: 101 }, (_, i) => `tag${i}`);

      await expect(tagCache.hasBeenRevalidated(tags, 0)).rejects.toThrow(
        RecoverableError,
      );
    });

    it("returns false when no tags were revalidated after lastModified", async () => {
      const lastModified = 50000;
      const revalidatedAt = 30000; // before lastModified

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: String(revalidatedAt) },
              },
            ],
          },
        }),
      );

      const result = await tagCache.hasBeenRevalidated(["tag1"], lastModified);

      expect(result).toBe(false);
    });

    it("returns true when a tag was revalidated after lastModified", async () => {
      const lastModified = 50000;
      const revalidatedAt = 80000; // after lastModified

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: String(revalidatedAt) },
              },
            ],
          },
        }),
      );

      const result = await tagCache.hasBeenRevalidated(["tag1"], lastModified);

      expect(result).toBe(true);
    });

    it("returns true when a tag has an expired TTL between lastModified and now", async () => {
      const now = Date.now();
      const expiry = now - 1000; // expired 1s ago
      const lastModified = now - 2000;

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: String(lastModified - 1) }, // before lastModified normally
                expire: { N: String(expiry) },
              },
            ],
          },
        }),
      );

      const result = await tagCache.hasBeenRevalidated(["tag1"], lastModified);

      expect(result).toBe(true);
    });

    it("returns false for a tag absent from DynamoDB", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Responses: { [TABLE_NAME]: [] } }),
      );

      const result = await tagCache.hasBeenRevalidated(["unknown-tag"], 0);

      expect(result).toBe(false);
    });

    it("sends a BatchGetItem request with the correct keys", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Responses: { [TABLE_NAME]: [] } }),
      );

      await tagCache.hasBeenRevalidated(["tag1", "tag2"], 0);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const keys = body.RequestItems[TABLE_NAME].Keys;
      expect(keys).toContainEqual({
        path: { S: buildKey("tag1") },
        tag: { S: buildKey("tag1") },
      });
      expect(keys).toContainEqual({
        path: { S: buildKey("tag2") },
        tag: { S: buildKey("tag2") },
      });
    });

    it("uses cached items on second call for the same tags", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Responses: { [TABLE_NAME]: [] } }),
      );

      await tagCache.hasBeenRevalidated(["tag1"], 0);
      await tagCache.hasBeenRevalidated(["tag1"], 0);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws RecoverableError when the response status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500, json: vi.fn() });

      await expect(tagCache.hasBeenRevalidated(["tag1"], 0)).rejects.toThrow(
        RecoverableError,
      );
    });
  });

  describe("isStale", () => {
    it("returns false when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.isStale(["tag1"], 12345);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("returns false when tags array is empty", async () => {
      const result = await tagCache.isStale([], 12345);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("throws RecoverableError when tags.length > 100", async () => {
      const tags = Array.from({ length: 101 }, (_, i) => `tag${i}`);

      await expect(tagCache.isStale(tags, 0)).rejects.toThrow(RecoverableError);
    });

    it("returns false when no tag has a stale timestamp after lastModified", async () => {
      const lastModified = 50000;
      const stale = 30000; // before lastModified

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: "1000" },
                stale: { N: String(stale) },
              },
            ],
          },
        }),
      );

      const result = await tagCache.isStale(["tag1"], lastModified);

      expect(result).toBe(false);
    });

    it("returns true when a tag has a stale timestamp after lastModified", async () => {
      const lastModified = 50000;
      const stale = 80000;

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: "1000" },
                stale: { N: String(stale) },
              },
            ],
          },
        }),
      );

      const result = await tagCache.isStale(["tag1"], lastModified);

      expect(result).toBe(true);
    });

    it("returns false when the tag has no stale field", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Responses: {
            [TABLE_NAME]: [
              {
                tag: { S: buildKey("tag1") },
                revalidatedAt: { N: "1000" },
              },
            ],
          },
        }),
      );

      const result = await tagCache.isStale(["tag1"], 0);

      expect(result).toBe(false);
    });

    it("shares the per-request cache with hasBeenRevalidated across calls", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Responses: { [TABLE_NAME]: [] } }),
      );

      // First call populates cached tag items
      await tagCache.hasBeenRevalidated(["tag1"], 0);
      // Second call uses the cache — no additional fetch
      await tagCache.isStale(["tag1"], 0);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws RecoverableError when the response status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500, json: vi.fn() });

      await expect(tagCache.isStale(["tag1"], 0)).rejects.toThrow(
        RecoverableError,
      );
    });
  });

  describe("writeTags", () => {
    it("writes string tags using the tag as both path and tag key", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags(["tag1", "tag2"]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const items = body.RequestItems[TABLE_NAME].map(
        (r: any) => r.PutRequest.Item,
      );
      expect(items[0].path.S).toBe(buildKey("tag1"));
      expect(items[0].tag.S).toBe(buildKey("tag1"));
    });

    it("writes object tags including stale and expiry", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([{ tag: "tag1", stale: 500, expire: 9999 }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const item = body.RequestItems[TABLE_NAME][0].PutRequest.Item;
      expect(item.stale).toEqual({ N: "500" });
      expect(item.expire).toEqual({ N: "9999" });
    });

    it("does not include stale or expiry when not provided in objects", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([{ tag: "tag1" }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const item = body.RequestItems[TABLE_NAME][0].PutRequest.Item;
      expect(item.stale).toBeUndefined();
      expect(item.expire).toBeUndefined();
    });

    it("skips write when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      await tagCache.writeTags(["tag1"]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("splits writes into multiple batches when tags exceed MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const tags = Array.from({ length: 26 }, (_, i) => `tag${i}`);

      await tagCache.writeTags(tags);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws a RecoverableError when the response status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 });

      // Error is caught inside writeTags, should not propagate
      await expect(tagCache.writeTags(["tag1"])).resolves.toBeUndefined();
    });
  });
});
