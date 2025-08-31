import type { NextModeTagCache } from "types/overrides";
import { debug } from "../../adapters/logger";

const tagsMap = new Map<string, number>();

export default {
  name: "fs-dev-nextMode",
  mode: "nextMode",
  getLastRevalidated: async (tags: string[]) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return 0;
    }

    let lastRevalidated = 0;

    tags.forEach((tag) => {
      const tagTime = tagsMap.get(tag);
      if (tagTime && tagTime > lastRevalidated) {
        lastRevalidated = tagTime;
      }
    });

    debug("getLastRevalidated result:", lastRevalidated);
    return lastRevalidated;
  },
  hasBeenRevalidated: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }

    const hasRevalidatedTag = tags.some((tag) => {
      const tagRevalidatedAt = tagsMap.get(tag);
      return tagRevalidatedAt ? tagRevalidatedAt > (lastModified ?? 0) : false;
    });

    debug("hasBeenRevalidated result:", hasRevalidatedTag);
    return hasRevalidatedTag;
  },
  writeTags: async (tags: string[]) => {
    if (
      globalThis.openNextConfig.dangerous?.disableTagCache ||
      tags.length === 0
    ) {
      return;
    }

    debug("writeTags", { tags: tags });

    tags.forEach((tag) => {
      tagsMap.set(tag, Date.now());
    });

    debug("writeTags completed, written", tags.length, "tags");
  },
} satisfies NextModeTagCache;
