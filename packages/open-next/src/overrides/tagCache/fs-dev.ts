import fs from "node:fs";
import path from "node:path";

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
  expiry?: { N: string };
}[];

const { NEXT_BUILD_ID } = process.env;

function buildKey(key: string) {
  return path.posix.join(NEXT_BUILD_ID ?? "", key);
}

const tagCache: TagCache = {
  name: "fs-dev",
  mode: "original",
  getByPath: async (path: string) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.path.S === buildKey(path))
      .map((tag) => tag.tag.S.replace(`${NEXT_BUILD_ID}/`, ""));
  },
  getByTag: async (tag: string) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.tag.S === buildKey(tag))
      .map((tagEntry) => tagEntry.path.S.replace(`${NEXT_BUILD_ID}/`, ""));
  },
  getLastModified: async (path: string, lastModified?: number) => {
    // Check if any tag has expired
    const now = Date.now();
    const hasExpiredTag = tags.some((tagPathMapping) => {
      if (
        tagPathMapping.path.S === buildKey(path) &&
        tagPathMapping.expiry?.N
      ) {
        const expiry = Number.parseInt(tagPathMapping.expiry.N);
        return expiry <= now && expiry > (lastModified ?? 0);
      }
      return false;
    });

    const nonExpiredRevalidatedTags = tags.filter(
      (tagPathMapping) =>
        tagPathMapping.path.S === buildKey(path) &&
        Number.parseInt(tagPathMapping.revalidatedAt.N) > (lastModified ?? 0) &&
        (!tagPathMapping.expiry?.N ||
          Number.parseInt(tagPathMapping.expiry.N) > now),
    );

    return nonExpiredRevalidatedTags.length > 0 || hasExpiredTag
      ? -1
      : (lastModified ?? Date.now());
  },
  hasBeenStale: async (path: string, lastModified?: number) => {
    return tags.some((entry) => {
      if (entry.path.S !== buildKey(path)) return false;
      if (!entry.stale?.N) return false;
      return Number.parseInt(entry.stale.N) > (lastModified ?? 0);
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
        const tagEntry: {
          tag: { S: string };
          path: { S: string };
          revalidatedAt: { N: string };
          stale?: { N: string };
          expiry?: { N: string };
        } = {
          tag: { S: buildKey(item.tag) },
          path: { S: buildKey(item.path) },
          revalidatedAt: { N: `${item.revalidatedAt ?? Date.now()}` },
        };
        if (item.stale !== undefined) {
          tagEntry.stale = { N: `${item.stale}` };
        }
        if (item.expiry !== undefined) {
          tagEntry.expiry = { N: `${item.expiry}` };
        }
        return tagEntry;
      }),
    );
  },
};

export default tagCache;
