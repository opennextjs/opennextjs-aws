import fs from "node:fs";
import path from "node:path";
import type { TagCacheMetaFile } from "types/cache";

import type { TagCache } from "types/overrides";
import { getMonorepoRelativePath } from "utils/normalize-path";

const tagFile = path.join(
  getMonorepoRelativePath(),
  "dynamodb-provider/dynamodb-cache.json",
);
const tagContent = fs.readFileSync(tagFile, "utf-8");

let tags = JSON.parse(tagContent) as {
  tag: { S: string };
  path: { S: string };
  revalidatedAt: { N: string };
  stale?: { N: string };
  expire?: { N: string };
}[];

const { OPEN_NEXT_BUILD_ID } = process.env;

function buildKey(key: string) {
  return path.posix.join(OPEN_NEXT_BUILD_ID ?? "", key);
}

const tagCache: TagCache = {
  name: "fs-dev",
  mode: "original",
  getByPath: async (path: string) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.path.S === buildKey(path))
      .map((tag) => tag.tag.S.replace(`${OPEN_NEXT_BUILD_ID}/`, ""));
  },
  getByTag: async (tag: string) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.tag.S === buildKey(tag))
      .map((tagEntry) => tagEntry.path.S.replace(`${OPEN_NEXT_BUILD_ID}/`, ""));
  },
  getLastModified: async (path: string, lastModified?: number) => {
    // Check if any tag has expired
    const now = Date.now();
    const hasExpiredTag = tags.some((tagPathMapping) => {
      if (
        tagPathMapping.path.S === buildKey(path) &&
        tagPathMapping.expire?.N
      ) {
        const expiry = Number.parseInt(tagPathMapping.expire.N);
        return expiry <= now && expiry > (lastModified ?? 0);
      }
      return false;
    });

    const nonExpiredRevalidatedTags = tags.filter(
      (tagPathMapping) =>
        tagPathMapping.path.S === buildKey(path) &&
        Number.parseInt(tagPathMapping.revalidatedAt.N) > (lastModified ?? 0) &&
        (!tagPathMapping.expire?.N ||
          Number.parseInt(tagPathMapping.expire.N) > now),
    );

    return nonExpiredRevalidatedTags.length > 0 || hasExpiredTag
      ? -1
      : (lastModified ?? Date.now());
  },
  isStale: async (path: string, lastModified?: number) => {
    return tags.some((entry) => {
      if (entry.path.S !== buildKey(path)) return false;
      if (!entry.stale?.N) return false;
      // A tag is stale when both its stale timestamp and its revalidatedAt are newer than the page.
      // revalidatedAt > lastModified ensures the revalidation that set this stale window happened
      // after the page was generated, preventing a stale signal from a previous ISR cycle.
      return (
        Number.parseInt(entry.revalidatedAt.N) > (lastModified ?? 0) &&
        Number.parseInt(entry.stale.N) > (lastModified ?? 0)
      );
    });
  },
  writeTags: async (newTags) => {
    const newTagsSet = new Set(
      newTags.map(({ tag, path }) => `${buildKey(tag)}-${buildKey(path)}`),
    );
    const unchangedTags = tags.filter(
      ({ tag, path }) => !newTagsSet.has(`${tag.S}-${path.S}`),
    );
    tags = unchangedTags.concat(
      newTags.map((item) => {
        const tagEntry: TagCacheMetaFile = {
          tag: { S: buildKey(item.tag) },
          path: { S: buildKey(item.path) },
          revalidatedAt: { N: `${item.revalidatedAt ?? Date.now()}` },
          ...(item.stale !== undefined
            ? { stale: { N: `${item.stale}` } }
            : undefined),
          ...(item.expire !== undefined
            ? { expire: { N: `${item.expire}` } }
            : undefined),
        };
        return tagEntry;
      }),
    );
  },
};

export default tagCache;
