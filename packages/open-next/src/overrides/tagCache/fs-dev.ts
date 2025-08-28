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
    const revalidatedTags = tags.filter(
      (tagPathMapping) =>
        tagPathMapping.path.S === buildKey(path) &&
        Number.parseInt(tagPathMapping.revalidatedAt.N) > (lastModified ?? 0),
    );
    return revalidatedTags.length > 0 ? -1 : (lastModified ?? Date.now());
  },
  writeTags: async (newTags) => {
    const newTagsSet = new Set(
      newTags.map(({ tag, path }) => `${buildKey(tag)}-${buildKey(path)}`),
    );
    const unchangedTags = tags.filter(
      ({ tag, path }) => !newTagsSet.has(`${tag.S}-${path.S}`),
    );
    tags = unchangedTags.concat(
      newTags.map((item) => ({
        tag: { S: buildKey(item.tag) },
        path: { S: buildKey(item.path) },
        revalidatedAt: { N: `${item.revalidatedAt ?? Date.now()}` },
      })),
    );
    // Should we write to the file here?
    // fs.writeFileSync(tagFile, JSON.stringify(tags));
  },
};

export default tagCache;
