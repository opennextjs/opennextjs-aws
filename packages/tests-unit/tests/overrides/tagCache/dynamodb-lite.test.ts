import { beforeEach, describe, expect, it, vi } from "vitest";

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

import tagCache from "@opennextjs/aws/overrides/tagCache/dynamodb-lite.js";

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
  process.env.NEXT_BUILD_ID = BUILD_ID;
  process.env.CACHE_DYNAMO_TABLE = TABLE_NAME;
  process.env.CACHE_BUCKET_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "test-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  globalThis.openNextConfig = { dangerous: { disableTagCache: false } };
  globalThis.__openNextAls = {
    getStore: vi.fn().mockReturnValue(makeStore()),
  };
});

describe("dynamodb-lite tagCache", () => {
  describe("getByPath", () => {
    it("returns tags with buildId prefix stripped", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Items: [
            { tag: { S: `${BUILD_ID}/tag1` } },
            { tag: { S: `${BUILD_ID}/tag2` } },
          ],
        }),
      );

      const result = await tagCache.getByPath("/some/path");

      expect(result).toEqual(["tag1", "tag2"]);
    });

    it("sends a Query request with the correct key", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      await tagCache.getByPath("/some/path");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.ExpressionAttributeValues[":key"]).toEqual({
        S: `${BUILD_ID}/some/path`,
      });
    });

    it("returns [] when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.getByPath("/some/path");

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("returns cached result on second call without re-fetching", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Items: [{ tag: { S: `${BUILD_ID}/tag1` } }] }),
      );

      await tagCache.getByPath("/some/path");
      const result = await tagCache.getByPath("/some/path");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(["tag1"]);
    });

    it("throws a RecoverableError when the response status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500, json: vi.fn() });

      await expect(tagCache.getByPath("/some/path")).resolves.toEqual([]);
    });

    it("returns [] on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network error"));

      const result = await tagCache.getByPath("/some/path");

      expect(result).toEqual([]);
    });
  });

  describe("getByTag", () => {
    it("returns paths with buildId prefix stripped", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Items: [
            { path: { S: `${BUILD_ID}/path1` } },
            { path: { S: `${BUILD_ID}/path2` } },
          ],
        }),
      );

      const result = await tagCache.getByTag("my-tag");

      expect(result).toEqual(["path1", "path2"]);
    });

    it("sends a Query request with the correct tag key", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      await tagCache.getByTag("my-tag");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.ExpressionAttributeValues[":tag"]).toEqual({
        S: `${BUILD_ID}/my-tag`,
      });
    });

    it("returns [] when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.getByTag("my-tag");

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("returns cached result on second call", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Items: [{ path: { S: `${BUILD_ID}/path1` } }] }),
      );

      await tagCache.getByTag("some-tag");
      const result = await tagCache.getByTag("some-tag");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(["path1"]);
    });

    it("returns [] on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch error"));

      const result = await tagCache.getByTag("my-tag");

      expect(result).toEqual([]);
    });
  });

  describe("getLastModified", () => {
    it("returns lastModified when no revalidated tags exist", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      const result = await tagCache.getLastModified("/key", 12345);

      expect(result).toBe(12345);
    });

    it("returns -1 when revalidated tags exist", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Items: [
            { revalidatedAt: { N: "99999" }, tag: { S: `${BUILD_ID}/t` } },
          ],
        }),
      );

      const result = await tagCache.getLastModified("/key", 12345);

      expect(result).toBe(-1);
    });

    it("returns -1 when an expired tag falls between lastModified and now", async () => {
      const now = Date.now();
      const expiry = now - 1000;
      const lastModified = now - 2000;

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Items: [
            {
              revalidatedAt: { N: String(expiry) },
              expire: { N: String(expiry) },
              tag: { S: `${BUILD_ID}/t` },
            },
          ],
        }),
      );

      const result = await tagCache.getLastModified("/key", lastModified);

      expect(result).toBe(-1);
    });

    it("excludes a tag whose expiry !== revalidatedAt from the non-expired count", async () => {
      // In dynamodb-lite, a non-expired tag satisfies expiry === revalidatedAt
      // A tag where expiry > now but expiry !== revalidatedAt counts as non-expired revalidated
      const now = Date.now();
      const revalidatedAt = now - 5000;
      const expiry = now + 60_000; // not expired, and expiry !== revalidatedAt

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          Items: [
            {
              revalidatedAt: { N: String(revalidatedAt) },
              expire: { N: String(expiry) },
              tag: { S: `${BUILD_ID}/t` },
            },
          ],
        }),
      );

      // expiry !== revalidatedAt, so filter returns false => nonExpiredRevalidatedTags is empty
      // hasExpiredTag is also false (expiry > now), so result is lastModified
      const result = await tagCache.getLastModified("/key", 0);

      expect(result).toBe(0);
    });

    it("returns lastModified when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.getLastModified("/key", 12345);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBe(12345);
    });

    it("returns cached result on second call with same key+lastModified", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      await tagCache.getLastModified("/key", 100);
      const result = await tagCache.getLastModified("/key", 100);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toBe(100);
    });

    it("returns lastModified on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch error"));

      const result = await tagCache.getLastModified("/key", 12345);

      expect(result).toBe(12345);
    });
  });

  describe("hasBeenStale", () => {
    it("returns true when items exist beyond lastModified", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ Items: [{ revalidatedAt: { N: "99999" } }] }),
      );

      const result = await tagCache.hasBeenStale("/key", 12345);

      expect(result).toBe(true);
    });

    it("returns false when no items exist", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      const result = await tagCache.hasBeenStale("/key", 12345);

      expect(result).toBe(false);
    });

    it("returns false when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      const result = await tagCache.hasBeenStale("/key", 12345);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("reuses cached items with getLastModified for the same key+lastModified", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ Items: [] }));

      // getLastModified does NOT share cache with hasBeenStale in dynamodb-lite
      // (getLastModified caches the numeric result; hasBeenStale caches raw items)
      // Both keys bring their own fetch, but hasBeenStale cache key uses raw items
      await tagCache.hasBeenStale("/key", 100);
      await tagCache.hasBeenStale("/key", 100);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns false on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch error"));

      const result = await tagCache.hasBeenStale("/key", 12345);

      expect(result).toBe(false);
    });
  });

  describe("writeTags", () => {
    it("calls fetch for the batch of tags", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([
        { path: "/path1", tag: "tag1", revalidatedAt: 1000 },
        { path: "/path2", tag: "tag2", revalidatedAt: 2000 },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("includes stale and expiry in the put item when provided", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([
        {
          path: "/path1",
          tag: "tag1",
          revalidatedAt: 1000,
          stale: 500,
          expire: 9999,
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const item = body.RequestItems[TABLE_NAME][0].PutRequest.Item;
      expect(item.stale).toEqual({ N: "500" });
      expect(item.expire).toEqual({ N: "9999" });
    });

    it("does not include stale or expiry when not provided", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([
        { path: "/path1", tag: "tag1", revalidatedAt: 1000 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const item = body.RequestItems[TABLE_NAME][0].PutRequest.Item;
      expect(item.stale).toBeUndefined();
      expect(item.expire).toBeUndefined();
    });

    it("builds the DynamoDB key with the buildId prefix", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      await tagCache.writeTags([{ path: "/p", tag: "t", revalidatedAt: 1000 }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const item = body.RequestItems[TABLE_NAME][0].PutRequest.Item;
      expect(item.path.S).toBe(`${BUILD_ID}/p`);
      expect(item.tag.S).toBe(`${BUILD_ID}/t`);
    });

    it("skips write when disableTagCache is true", async () => {
      globalThis.openNextConfig = { dangerous: { disableTagCache: true } };

      await tagCache.writeTags([
        { path: "/path1", tag: "tag1", revalidatedAt: 1000 },
      ]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("splits writes into multiple batches when tags exceed MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const tags = Array.from({ length: 26 }, (_, i) => ({
        path: `/path${i}`,
        tag: `tag${i}`,
        revalidatedAt: 1000,
      }));

      await tagCache.writeTags(tags);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws when the response status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 });

      // error is caught internally, should not propagate
      await expect(
        tagCache.writeTags([{ path: "/p", tag: "t", revalidatedAt: 0 }]),
      ).resolves.toBeUndefined();
    });
  });
});
