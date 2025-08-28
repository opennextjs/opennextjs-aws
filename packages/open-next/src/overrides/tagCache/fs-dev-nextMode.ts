import fs from "node:fs";
import path from "node:path";

import type { NextModeTagCache } from "types/overrides";
import { getMonorepoRelativePath } from "utils/normalize-path";
import { debug } from "../../adapters/logger";

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

function buildKey(key: string) {
  const { NEXT_BUILD_ID } = process.env;
  return path.posix.join(NEXT_BUILD_ID ?? "", key);
}

function buildObject(tag: string, revalidatedAt?: number) {
  return {
    path: { S: buildKey(tag) },
    tag: { S: buildKey(tag) },
    revalidatedAt: { N: `${revalidatedAt ?? Date.now()}` },
  };
}

export default {
  name: "fs-dev-nextMode",
  mode: "nextMode",
  getLastRevalidated: async (tagsToCheck: string[]) => {
    // Not supported for now
    // TODO: Implement getLastRevalidated
    return 0;
  },
  hasBeenRevalidated: async (tagsToCheck: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    debug("hasBeenRevalidated", { tags: tagsToCheck, lastModified });

    // Build the cache keys for the tags we're checking
    const cacheKeys = tagsToCheck.map((tag) => buildKey(tag));

    // Check if any tag has been revalidated after the lastModified time
    const hasRevalidatedTag = tags.some((tagEntry) => {
      const tagRevalidatedAt = Number.parseInt(tagEntry.revalidatedAt.N);
      return (
        cacheKeys.includes(tagEntry.tag.S) &&
        tagRevalidatedAt > (lastModified ?? Date.now())
      );
    });

    debug("hasBeenRevalidated result:", hasRevalidatedTag);
    return hasRevalidatedTag;
  },
  writeTags: async (tagsToWrite: string[]) => {
    if (
      globalThis.openNextConfig.dangerous?.disableTagCache ||
      tagsToWrite.length === 0
    ) {
      return Promise.resolve();
    }

    debug("writeTags", { tags: tagsToWrite });

    // Create new tag objects to write
    const newTagObjects = tagsToWrite.map((tag) =>
      buildObject(tag, Date.now()),
    );

    // Remove any existing entries for these tags to avoid duplicates
    const existingTagKeys = newTagObjects.map((obj) => obj.tag.S);
    tags = tags.filter((tagEntry) => !existingTagKeys.includes(tagEntry.tag.S));

    // Add the new tags
    tags.push(...newTagObjects);

    fs.writeFileSync(tagFile, JSON.stringify(tags));

    debug("writeTags completed, written", newTagObjects.length, "tags");

    return Promise.resolve();
  },
} satisfies NextModeTagCache;
