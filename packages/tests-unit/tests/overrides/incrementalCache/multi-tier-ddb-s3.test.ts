import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTagsFromValue } from "@opennextjs/aws/utils/cache.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
  debug: vi.fn(),
  error: vi.fn(),
}));

const mockFetch = vi.hoisted(() => vi.fn());
const mockS3Get = vi.hoisted(() => vi.fn());

vi.mock("@opennextjs/aws/utils/fetch.js", () => ({
  customFetchClient: vi.fn().mockReturnValue(mockFetch),
}));

vi.mock("@opennextjs/aws/overrides/incrementalCache/s3-lite.js", () => ({
  default: { get: mockS3Get, set: vi.fn(), delete: vi.fn() },
  getAwsClient: vi.fn(),
}));

import multiTierCache from "@opennextjs/aws/overrides/incrementalCache/multi-tier-ddb-s3.js";

function s3Entry() {
  return {
    value: {
      type: "app",
      html: "<html></html>",
      rsc: "",
      meta: {
        status: 200,
        headers: { "x-next-cache-tags": "_N_T_/layout,posts" },
      },
    },
    lastModified: 1000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPEN_NEXT_BUILD_ID = "test-build-id";
  process.env.CACHE_DYNAMO_TABLE = "test-table";
  process.env.CACHE_BUCKET_REGION = "us-east-1";
  // No DynamoDB metadata: the local entry is still current.
  mockFetch.mockResolvedValue({
    status: 200,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("multi-tier-ddb-s3 incremental cache", () => {
  it("keeps the cache tags of a local entry after a caller reads them", async () => {
    mockS3Get.mockResolvedValueOnce(s3Entry());

    const fromS3 = await multiTierCache.get("page-with-tags", "cache");
    expect(getTagsFromValue(fromS3?.value as any)).toEqual([
      "_N_T_/layout",
      "posts",
    ]);

    const fromLocalCache = await multiTierCache.get("page-with-tags", "cache");
    expect(mockS3Get).toHaveBeenCalledTimes(1);
    expect(getTagsFromValue(fromLocalCache?.value as any)).toEqual([
      "_N_T_/layout",
      "posts",
    ]);

    const again = await multiTierCache.get("page-with-tags", "cache");
    expect(getTagsFromValue(again?.value as any)).toEqual([
      "_N_T_/layout",
      "posts",
    ]);
  });

  it("hands out a separate copy on each local cache hit", async () => {
    mockS3Get.mockResolvedValueOnce(s3Entry());
    await multiTierCache.get("copied-page", "cache");

    const first = await multiTierCache.get("copied-page", "cache");
    const second = await multiTierCache.get("copied-page", "cache");
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
