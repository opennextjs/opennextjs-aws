import fs from "node:fs";
import path from "node:path";

import type { TagCache, TagKey } from "types/overrides";
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
}[];

const tagCache: TagCache = {
  name: "fs-dev",
  mode: "original",
  getByPath: async (path: TagKey) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.path.S === path.baseKey)
      .map((tag) => tag.tag.S);
  },
  getByTag: async (tag: TagKey) => {
    return tags
      .filter((tagPathMapping) => tagPathMapping.tag.S === tag.baseKey)
      .map((tag) => tag.path.S);
  },
  getLastModified: async (path: TagKey, lastModified?: number) => {
    const revalidatedTags = tags.filter(
      (tagPathMapping) =>
        tagPathMapping.path.S === path.baseKey &&
        Number.parseInt(tagPathMapping.revalidatedAt.N) > (lastModified ?? 0),
    );
    return revalidatedTags.length > 0 ? -1 : (lastModified ?? Date.now());
  },
  writeTags: async (newTags) => {
    const newTagsSet = new Set(
      newTags.map(({ tag, path }) => `${tag}-${path}`),
    );
    const unchangedTags = tags.filter(
      ({ tag, path }) => !newTagsSet.has(`${tag.S}-${path.S}`),
    );
    tags = unchangedTags.concat(
      newTags.map((tag) => ({
        tag: { S: tag.tag.baseKey },
        path: { S: tag.path.baseKey },
        revalidatedAt: { N: String(tag.revalidatedAt ?? 1) },
      })),
    );
  },
};

export default tagCache;
